import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import type { JWTPayload } from "jose";
import type { Request } from "express";

import { DatabaseService } from "../database/database.service";
import type { SocialLoginRequest } from "./auth.controller";

const DEBUG_PREFIX = "debug-login:";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

type AuthProvider = "google" | "apple" | "debug";

interface SocialProfile {
  email: string;
  displayName: string;
}

interface OAuthState {
  provider: AuthProvider;
  returnTo: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly accessTtlMinutes = Number(process.env.JWT_ACCESS_TTL_MINUTES || 60);
  private readonly refreshTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  getProviderAvailability() {
    return {
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      apple: Boolean(
        process.env.APPLE_CLIENT_ID &&
          process.env.APPLE_TEAM_ID &&
          process.env.APPLE_KEY_ID &&
          process.env.APPLE_PRIVATE_KEY,
      ),
    };
  }

  async buildOAuthAuthorizationUrl(providerInput: string, returnTo?: string) {
    const provider = this.normalizeProvider(providerInput);
    if (provider === "debug" || !this.getProviderAvailability()[provider]) {
      throw new BadRequestException("Auth provider is not configured.");
    }

    const redirectUri = this.getProviderCallbackUrl(provider);
    const state = await this.issueOAuthState({ provider, returnTo: this.normalizeReturnTo(returnTo) });

    if (provider === "google") {
      const params = new URLSearchParams({
        access_type: "offline",
        client_id: this.getRequiredEnv("GOOGLE_CLIENT_ID"),
        prompt: "select_account",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    if (provider === "apple") {
      const params = new URLSearchParams({
        client_id: this.getRequiredEnv("APPLE_CLIENT_ID"),
        redirect_uri: redirectUri,
        response_mode: "form_post",
        response_type: "code",
        scope: "name email",
        state,
      });
      return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
    }

    throw new BadRequestException("Unsupported auth provider.");
  }

  async completeOAuthCallback(providerInput: string, code: string | undefined, stateToken: string | undefined) {
    if (!code || !stateToken) {
      throw new BadRequestException("Missing OAuth callback parameters.");
    }

    const provider = this.normalizeProvider(providerInput);
    const state = await this.verifyOAuthState(stateToken);
    if (state.provider !== provider) {
      throw new BadRequestException("Invalid OAuth state.");
    }

    const profile = await this.exchangeOAuthCode(provider, code);
    const session = await this.loginOrCreateUser(profile, provider);

    return {
      ...session,
      returnTo: state.returnTo,
      webRedirectUrl: this.getPostLoginWebRedirectUrl(session.user.role),
    };
  }

  async loginWithSocial(input: SocialLoginRequest) {
    const provider = this.normalizeProvider(input.provider);
    const profile = await this.verifySocialCredential(provider, input.idToken);
    return this.loginOrCreateUser(profile, provider);
  }

  async getCurrentUser(request: Request): Promise<AuthenticatedUser | null> {
    const bearerToken = this.getBearerToken(request);
    if (bearerToken) {
      const claims = await this.verifyAccessToken(bearerToken);
      return this.findUserFromClaims(claims);
    }

    const refreshToken = this.getSessionRefreshToken(request);
    if (!refreshToken) {
      return null;
    }

    const token = await this.database.refreshToken.findUnique({
      include: { user: true },
      where: { token: refreshToken },
    });

    if (!token || token.revoked || token.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return this.toAuthenticatedUser(token.user);
  }

  async refresh(refreshToken: string) {
    const token = await this.database.refreshToken.findUnique({
      include: { user: true },
      where: { token: refreshToken },
    });

    if (!token || token.revoked || token.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    return {
      accessToken: await this.issueAccessToken(token.user),
    };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) {
      return;
    }

    await this.database.refreshToken
      .update({
        data: { revoked: true },
        where: { token: refreshToken },
      })
      .catch(() => undefined);
  }

  async requireAuthenticatedUser(request: Request): Promise<AuthenticatedUser> {
    const user = await this.getCurrentUser(request);
    if (!user) {
      throw new UnauthorizedException("Missing or invalid auth session");
    }
    return user;
  }

  getSessionRefreshToken(request: Request) {
    return this.getCookieValue(request, this.getSessionCookieName());
  }

  getSessionCookieName() {
    return process.env.SESSION_COOKIE_NAME || "trailbook_session";
  }

  getSessionCookieOptions() {
    const secure = this.getAuthBaseUrl().startsWith("https://");
    return {
      httpOnly: true,
      maxAge: this.refreshTtlDays * 24 * 60 * 60 * 1000,
      path: "/",
      sameSite: "lax" as const,
      secure,
    };
  }

  private async verifySocialCredential(provider: AuthProvider, credential: string): Promise<SocialProfile> {
    if (provider === "debug") {
      const email = credential.startsWith(DEBUG_PREFIX) ? credential.slice(DEBUG_PREFIX.length).trim() : "";
      if (!email) throw new UnauthorizedException("Invalid token");
      return { email: email.toLowerCase(), displayName: this.displayNameFromEmail(email) };
    }

    if (provider === "google") {
      const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
        audience: this.getAudience("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_IDS"),
        issuer: ["accounts.google.com", "https://accounts.google.com"],
      });
      return this.profileFromJwt(payload);
    }

    if (provider === "apple") {
      const { payload } = await jwtVerify(credential, APPLE_JWKS, {
        audience: this.getAudience("APPLE_CLIENT_ID", "APPLE_CLIENT_IDS"),
        issuer: "https://appleid.apple.com",
      });
      return this.profileFromJwt(payload);
    }

    throw new BadRequestException("Unsupported auth provider.");
  }

  private async exchangeOAuthCode(provider: AuthProvider, code: string): Promise<SocialProfile> {
    if (provider === "google") {
      const tokenResponse = await this.postForm<{ id_token?: string }>("https://oauth2.googleapis.com/token", {
        client_id: this.getRequiredEnv("GOOGLE_CLIENT_ID"),
        client_secret: this.getRequiredEnv("GOOGLE_CLIENT_SECRET"),
        code,
        grant_type: "authorization_code",
        redirect_uri: this.getProviderCallbackUrl("google"),
      });
      if (!tokenResponse.id_token) throw new UnauthorizedException("Google did not return an id token.");
      return this.verifySocialCredential("google", tokenResponse.id_token);
    }

    if (provider === "apple") {
      const tokenResponse = await this.postForm<{ id_token?: string }>("https://appleid.apple.com/auth/token", {
        client_id: this.getRequiredEnv("APPLE_CLIENT_ID"),
        client_secret: await this.createAppleClientSecret(),
        code,
        grant_type: "authorization_code",
        redirect_uri: this.getProviderCallbackUrl("apple"),
      });
      if (!tokenResponse.id_token) throw new UnauthorizedException("Apple did not return an id token.");
      return this.verifySocialCredential("apple", tokenResponse.id_token);
    }

    throw new BadRequestException("Unsupported auth provider.");
  }

  private async loginOrCreateUser(profile: SocialProfile, provider: AuthProvider) {
    const email = profile.email.trim().toLowerCase();
    if (!email) throw new UnauthorizedException("Provider did not return an email address.");

    const user = await this.database.user.upsert({
      create: {
        displayName: profile.displayName.trim() || this.displayNameFromEmail(email),
        email,
        role: "user",
      },
      update: {
        displayName: profile.displayName.trim() || this.displayNameFromEmail(email),
      },
      where: { email },
    });

    const accessToken = await this.issueAccessToken(user);
    const refreshToken = await this.database.refreshToken.create({
      data: {
        expiresAt: new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000),
        userId: user.id,
      },
    });

    return {
      accessToken,
      refreshToken: refreshToken.token,
      user: {
        ...this.toAuthenticatedUser(user),
        provider,
      },
    };
  }

  private profileFromJwt(payload: JWTPayload): SocialProfile {
    const email = String(payload.email || "").trim().toLowerCase();
    if (!email) throw new UnauthorizedException("Provider did not return an email address.");

    const name = String(payload.name || "").trim();
    return {
      email,
      displayName: name || this.displayNameFromEmail(email),
    };
  }

  private async postForm<T>(url: string, body: Record<string, string>) {
    const response = await fetch(url, {
      body: new URLSearchParams(body),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    return this.parseProviderResponse<T>(response);
  }

  private async fetchJson<T>(url: string) {
    const response = await fetch(url);
    return this.parseProviderResponse<T>(response);
  }

  private async parseProviderResponse<T>(response: Response) {
    const payload = (await response.json().catch(() => null)) as T | { error?: string; error_description?: string } | null;
    if (!response.ok) {
      const providerError = typeof payload === "object" && payload !== null ? payload : null;
      const message =
        providerError && "error_description" in providerError
          ? providerError.error_description
          : providerError && "error" in providerError
            ? providerError.error
            : `Provider request failed with status ${response.status}`;
      throw new UnauthorizedException(message);
    }
    return payload as T;
  }

  private async issueOAuthState(state: OAuthState) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ provider: state.provider, returnTo: state.returnTo })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 10 * 60)
      .sign(this.getJwtSecret());
  }

  private async verifyOAuthState(token: string): Promise<OAuthState> {
    try {
      const { payload } = await jwtVerify(token, this.getJwtSecret());
      return {
        provider: this.normalizeProvider(String(payload.provider || "")),
        returnTo: typeof payload.returnTo === "string" ? payload.returnTo : null,
      };
    } catch {
      throw new UnauthorizedException("Invalid OAuth state.");
    }
  }

  private async createAppleClientSecret() {
    const privateKey = this.getRequiredEnv("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
    const key = await importPKCS8(privateKey, "ES256");
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.getRequiredEnv("APPLE_KEY_ID") })
      .setIssuer(this.getRequiredEnv("APPLE_TEAM_ID"))
      .setAudience("https://appleid.apple.com")
      .setSubject(this.getRequiredEnv("APPLE_CLIENT_ID"))
      .setIssuedAt(now)
      .setExpirationTime(now + 5 * 60)
      .sign(key);
  }

  private async findUserFromClaims(claims: JWTPayload) {
    const userId = String(claims.sub || "");
    if (!userId) return null;

    const user = await this.database.user.findUnique({ where: { id: userId } });
    return user ? this.toAuthenticatedUser(user) : null;
  }

  private async issueAccessToken(user: { id: string; email: string; role: string }) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt(now)
      .setExpirationTime(now + this.accessTtlMinutes * 60)
      .sign(this.getJwtSecret());
  }

  private async verifyAccessToken(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.getJwtSecret());
      return payload;
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
  }

  private getProviderCallbackUrl(provider: Exclude<AuthProvider, "debug">) {
    return `${this.getAuthBaseUrl()}/api/v1/auth/${provider}/callback`;
  }

  private getPostLoginWebRedirectUrl(role: string) {
    const webAppUrl = this.getRequiredEnv("WEB_APP_URL").replace(/\/+$/, "");
    return role === "admin" ? `${webAppUrl}/dashboard` : `${webAppUrl}/trips`;
  }

  private normalizeReturnTo(returnTo?: string) {
    if (!returnTo) return null;
    if (
      /^(?:trailbook|trailbook-local|trailbook-test):\/{2,3}auth\/callback$/.test(
        returnTo,
      )
    ) {
      return returnTo;
    }
    throw new BadRequestException("Invalid returnTo URL.");
  }

  private normalizeProvider(provider: string): AuthProvider {
    const normalized = provider.trim().toLowerCase();
    if (normalized === "google" || normalized === "apple" || normalized === "debug") {
      return normalized;
    }
    throw new BadRequestException("Unsupported auth provider.");
  }

  private getAudience(primaryName: string, listName: string) {
    const values = [process.env[primaryName], process.env[listName]]
      .filter(Boolean)
      .flatMap((value) => value!.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length === 0) throw new BadRequestException(`${primaryName} is not configured.`);
    return values.length === 1 ? values[0] : values;
  }

  private getBearerToken(request: Request) {
    const header = request.get("authorization");
    return header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  }

  private getCookieValue(request: Request, name: string) {
    const cookieHeader = request.get("cookie");
    if (!cookieHeader) return null;

    for (const cookie of cookieHeader.split(";")) {
      const [rawName, ...rawValue] = cookie.trim().split("=");
      if (rawName === name) return decodeURIComponent(rawValue.join("="));
    }

    return null;
  }

  private toAuthenticatedUser(user: { id: string; email: string; displayName: string; role: string }) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }

  private displayNameFromEmail(email: string) {
    return email.split("@")[0] || "Trailbook user";
  }

  private getRequiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new BadRequestException(`${name} is not configured.`);
    return value;
  }

  private getAuthBaseUrl() {
    return this.getRequiredEnv("AUTH_BASE_URL").replace(/\/+$/, "");
  }

  private getJwtSecret() {
    return new TextEncoder().encode(process.env.JWT_SECRET || "trailbook-local-dev-secret-change-me");
  }
}
