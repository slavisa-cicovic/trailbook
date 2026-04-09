import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac } from "node:crypto";

import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from "jose";

import { UsersService } from "../users/users.service";
import type { AuthProvider } from "../users/user.types";
import { AuthService } from "./auth.service";
import { createOpaqueToken } from "./auth.utils";

type SocialProvider = Exclude<AuthProvider, "local">;
type SocialClient = "web" | "mobile";

interface AuthRequestMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface SocialCallbackInput {
  code?: string | null;
  state?: string | null;
  error?: string | null;
  user?: string | null;
}

interface SocialProfile {
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  provider: SocialProvider;
  providerSubject: string;
}

interface SocialStateContext {
  client: SocialClient;
  redirectUri?: string;
  state: string;
}

interface AuthHandoffEntry {
  createdAt: number;
  expiresAt: number;
  sessionToken: string;
  user: Awaited<ReturnType<AuthService["getCurrentUser"]>>["user"];
}

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

@Injectable()
export class SocialAuthService {
  private readonly authHandoffs = new Map<string, AuthHandoffEntry>();
  private readonly handoffTtlMs = 1000 * 60 * 5;

  constructor(
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(UsersService)
    private readonly usersService: UsersService,
  ) {}

  createAuthorizationRequest(provider: SocialProvider, client: SocialClient = "web", redirectUri?: string) {
    if (client === "mobile" && !redirectUri) {
      throw new BadRequestException("Mobile social auth requires a redirectUri.");
    }

    const state = createOpaqueToken();

    return {
      authorizationUrl: this.buildAuthorizationUrl(provider, state),
      cookieName: this.getStateCookieName(provider),
      stateContext: this.encodeStateContext({
        state,
        client,
        redirectUri,
      }),
    };
  }

  getProviderAvailability() {
    return {
      google: this.isProviderConfigured("google"),
      apple: this.isProviderConfigured("apple"),
      facebook: this.isProviderConfigured("facebook"),
    };
  }

  async handleCallback(
    provider: SocialProvider,
    input: SocialCallbackInput,
    expectedStateContext: string | undefined,
    metadata?: AuthRequestMetadata,
  ) {
    const stateContext = this.decodeAndValidateStateContext(provider, input.state, expectedStateContext);

    if (input.error) {
      throw new UnauthorizedException(`${this.getProviderLabel(provider)} login was denied.`);
    }

    if (!input.code) {
      throw new BadRequestException(`${this.getProviderLabel(provider)} callback is missing an authorization code.`);
    }

    const profile = await this.resolveProfile(provider, input.code, input.user || undefined);
    const user = await this.resolveOrCreateUser(profile);
    const loginResult = await this.authService.completeLoginForUser(user.id, metadata);

    if (stateContext.client === "mobile") {
      if (!loginResult.user) {
        throw new UnauthorizedException("Unable to establish a mobile social session.");
      }

      const handoffCode = this.createAuthHandoff(loginResult.session.id, loginResult.user);
      const redirectUrl = new URL(stateContext.redirectUri || "trailbook://auth/callback");
      redirectUrl.searchParams.set("handoffCode", handoffCode);
      redirectUrl.searchParams.set("provider", provider);

      return {
        redirectUrl: redirectUrl.toString(),
        session: loginResult.session,
        user: loginResult.user,
      };
    }

    return {
      redirectUrl: this.getSuccessRedirectUrl(),
      session: loginResult.session,
      user: loginResult.user,
    };
  }

  consumeAuthHandoff(code: string) {
    this.pruneExpiredHandoffs();

    const handoff = this.authHandoffs.get(code);

    if (!handoff || handoff.expiresAt < Date.now()) {
      this.authHandoffs.delete(code);
      throw new UnauthorizedException("Mobile auth handoff is invalid or expired.");
    }

    this.authHandoffs.delete(code);

    return {
      sessionToken: handoff.sessionToken,
      user: handoff.user,
    };
  }

  getErrorRedirectUrl(provider: SocialProvider, reason: string) {
    const url = new URL("/login", this.getWebAppUrl());
    url.searchParams.set("provider", provider);
    url.searchParams.set("error", reason);
    return url.toString();
  }

  getMobileErrorRedirectUrl(provider: SocialProvider, redirectUri: string, reason: string) {
    const url = new URL(redirectUri);
    url.searchParams.set("provider", provider);
    url.searchParams.set("error", reason);
    return url.toString();
  }

  getStateCookieName(provider: SocialProvider) {
    return `trailbook_oauth_state_${provider}`;
  }

  private encodeStateContext(context: SocialStateContext) {
    return Buffer.from(JSON.stringify(context)).toString("base64url");
  }

  private decodeAndValidateStateContext(
    provider: SocialProvider,
    returnedState: string | null | undefined,
    encodedExpectedContext: string | undefined,
  ) {
    if (!returnedState || !encodedExpectedContext) {
      throw new BadRequestException(`${this.getProviderLabel(provider)} state validation failed.`);
    }

    let parsed: SocialStateContext | null = null;

    try {
      parsed = JSON.parse(Buffer.from(encodedExpectedContext, "base64url").toString("utf8")) as SocialStateContext;
    } catch {
      parsed = null;
    }

    if (!parsed || parsed.state !== returnedState) {
      throw new BadRequestException(`${this.getProviderLabel(provider)} state validation failed.`);
    }

    return parsed;
  }

  decodeStateContext(encodedExpectedContext: string | undefined) {
    if (!encodedExpectedContext) {
      return null;
    }

    try {
      return JSON.parse(Buffer.from(encodedExpectedContext, "base64url").toString("utf8")) as SocialStateContext;
    } catch {
      return null;
    }
  }

  private createAuthHandoff(
    sessionToken: string,
    user: Awaited<ReturnType<AuthService["getCurrentUser"]>>["user"],
  ) {
    const code = createOpaqueToken();

    this.pruneExpiredHandoffs();
    this.authHandoffs.set(code, {
      sessionToken,
      user,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.handoffTtlMs,
    });

    return code;
  }

  private pruneExpiredHandoffs() {
    const now = Date.now();

    for (const [code, handoff] of this.authHandoffs.entries()) {
      if (handoff.expiresAt < now) {
        this.authHandoffs.delete(code);
      }
    }
  }

  private async resolveOrCreateUser(profile: SocialProfile) {
    const existingByIdentity = await this.usersService.findByExternalIdentity(profile.provider, profile.providerSubject);

    if (existingByIdentity) {
      return existingByIdentity;
    }

    if (profile.email) {
      const existingByEmail = await this.usersService.findByEmail(profile.email);

      if (existingByEmail) {
        if (!profile.emailVerified) {
          throw new UnauthorizedException(
            `${this.getProviderLabel(profile.provider)} account email could not be safely linked to an existing Trailbook user.`,
          );
        }

        const linkedUser = await this.usersService.linkExternalIdentity(existingByEmail.id, {
          provider: profile.provider,
          providerSubject: profile.providerSubject,
          email: profile.email,
        });

        if (!linkedUser) {
          throw new UnauthorizedException("Unable to link the external identity to the existing account.");
        }

        return linkedUser;
      }
    }

    if (!profile.email) {
      throw new UnauthorizedException(`${this.getProviderLabel(profile.provider)} did not provide an email address.`);
    }

    return this.usersService.createSocialUser({
      provider: profile.provider,
      providerSubject: profile.providerSubject,
      email: profile.email,
      displayName: profile.displayName,
    });
  }

  private buildAuthorizationUrl(provider: SocialProvider, state: string) {
    const redirectUri = this.getRedirectUri(provider);

    switch (provider) {
      case "google": {
        const clientId = this.requireEnv("GOOGLE_CLIENT_ID");
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid email profile");
        url.searchParams.set("state", state);
        return url.toString();
      }
      case "facebook": {
        const appId = this.requireEnv("FACEBOOK_APP_ID");
        const url = new URL("https://www.facebook.com/v23.0/dialog/oauth");
        url.searchParams.set("client_id", appId);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "email,public_profile");
        url.searchParams.set("state", state);
        return url.toString();
      }
      case "apple": {
        const clientId = this.requireEnv("APPLE_CLIENT_ID");
        const url = new URL("https://appleid.apple.com/auth/authorize");
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("response_mode", "query");
        url.searchParams.set("scope", "name email");
        url.searchParams.set("state", state);
        return url.toString();
      }
    }
  }

  private isProviderConfigured(provider: SocialProvider) {
    switch (provider) {
      case "google":
        return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
      case "facebook":
        return Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
      case "apple":
        return Boolean(
          process.env.APPLE_CLIENT_ID &&
            process.env.APPLE_TEAM_ID &&
            process.env.APPLE_KEY_ID &&
            process.env.APPLE_PRIVATE_KEY,
        );
    }
  }

  private async resolveProfile(provider: SocialProvider, code: string, providerUserPayload?: string) {
    switch (provider) {
      case "google":
        return this.exchangeGoogleCode(code);
      case "facebook":
        return this.exchangeFacebookCode(code);
      case "apple":
        return this.exchangeAppleCode(code, providerUserPayload);
    }
  }

  private async exchangeGoogleCode(code: string): Promise<SocialProfile> {
    const clientId = this.requireEnv("GOOGLE_CLIENT_ID");
    const clientSecret = this.requireEnv("GOOGLE_CLIENT_SECRET");
    const tokenResponse = await this.fetchJson<{
      access_token?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    }>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: this.getRedirectUri("google"),
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.id_token) {
      throw new UnauthorizedException("Google token exchange did not return an ID token.");
    }

    const verification = await jwtVerify(tokenResponse.id_token, googleJwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });

    const payload = verification.payload;
    const email = typeof payload.email === "string" ? payload.email : null;

    return {
      provider: "google",
      providerSubject: this.requireStringClaim(payload, "sub", "Google"),
      email,
      emailVerified: payload.email_verified === true,
      displayName: this.buildDisplayName("Google user", typeof payload.name === "string" ? payload.name : null, email),
    };
  }

  private async exchangeFacebookCode(code: string): Promise<SocialProfile> {
    const appId = this.requireEnv("FACEBOOK_APP_ID");
    const appSecret = this.requireEnv("FACEBOOK_APP_SECRET");
    const tokenUrl = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", appId);
    tokenUrl.searchParams.set("client_secret", appSecret);
    tokenUrl.searchParams.set("redirect_uri", this.getRedirectUri("facebook"));
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await this.fetchJson<{ access_token?: string }>(tokenUrl.toString());

    if (!tokenResponse.access_token) {
      throw new UnauthorizedException("Facebook token exchange did not return an access token.");
    }

    const profileUrl = new URL("https://graph.facebook.com/me");
    profileUrl.searchParams.set("fields", "id,name,email");
    profileUrl.searchParams.set("access_token", tokenResponse.access_token);
    profileUrl.searchParams.set(
      "appsecret_proof",
      createHmac("sha256", appSecret).update(tokenResponse.access_token).digest("hex"),
    );

    const profileResponse = await this.fetchJson<{ email?: string; id?: string; name?: string }>(profileUrl.toString());
    const email = typeof profileResponse.email === "string" ? profileResponse.email : null;

    return {
      provider: "facebook",
      providerSubject: this.requireString(profileResponse.id, "Facebook"),
      email,
      emailVerified: false,
      displayName: this.buildDisplayName("Facebook user", profileResponse.name || null, email),
    };
  }

  private async exchangeAppleCode(code: string, providerUserPayload?: string): Promise<SocialProfile> {
    const clientId = this.requireEnv("APPLE_CLIENT_ID");
    const tokenResponse = await this.fetchJson<{ id_token?: string }>("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: await this.createAppleClientSecret(),
        grant_type: "authorization_code",
        redirect_uri: this.getRedirectUri("apple"),
      }),
    });

    if (!tokenResponse.id_token) {
      throw new UnauthorizedException("Apple token exchange did not return an ID token.");
    }

    const verification = await jwtVerify(tokenResponse.id_token, appleJwks, {
      issuer: "https://appleid.apple.com",
      audience: clientId,
    });

    const payload = verification.payload;
    const email = typeof payload.email === "string" ? payload.email : null;
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    const appleUser = this.parseAppleUser(providerUserPayload);

    return {
      provider: "apple",
      providerSubject: this.requireStringClaim(payload, "sub", "Apple"),
      email,
      emailVerified,
      displayName: this.buildDisplayName("Apple user", appleUser, email),
    };
  }

  private async createAppleClientSecret() {
    const clientId = this.requireEnv("APPLE_CLIENT_ID");
    const teamId = this.requireEnv("APPLE_TEAM_ID");
    const keyId = this.requireEnv("APPLE_KEY_ID");
    const privateKeyPem = this.requireEnv("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
    const privateKey = await importPKCS8(privateKeyPem, "ES256");

    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setSubject(clientId)
      .setAudience("https://appleid.apple.com")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  }

  private parseAppleUser(providerUserPayload?: string) {
    if (!providerUserPayload) {
      return null;
    }

    try {
      const parsed = JSON.parse(providerUserPayload) as {
        name?: { firstName?: string; lastName?: string };
      };
      const parts = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean);
      return parts.length ? parts.join(" ") : null;
    } catch {
      return null;
    }
  }

  private buildDisplayName(fallback: string, providerName: string | null, email: string | null) {
    const candidate = providerName?.trim();

    if (candidate) {
      return candidate;
    }

    if (email) {
      return email.split("@")[0] || fallback;
    }

    return fallback;
  }

  private getRedirectUri(provider: SocialProvider) {
    return new URL(`/api/auth/${provider}/callback`, this.getAuthBaseUrl()).toString();
  }

  private getAuthBaseUrl() {
    return process.env.AUTH_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
  }

  private getWebAppUrl() {
    return process.env.WEB_APP_URL || "http://localhost:3000";
  }

  private getSuccessRedirectUrl() {
    return new URL("/dashboard", this.getWebAppUrl()).toString();
  }

  private getProviderLabel(provider: SocialProvider) {
    switch (provider) {
      case "google":
        return "Google";
      case "facebook":
        return "Facebook";
      case "apple":
        return "Apple";
    }
  }

  private requireEnv(name: string) {
    const value = process.env[name];

    if (!value) {
      throw new ServiceUnavailableException(`${name} is not configured.`);
    }

    return value;
  }

  private requireString(value: string | undefined, provider: string) {
    if (!value) {
      throw new UnauthorizedException(`${provider} identity payload is missing a required subject.`);
    }

    return value;
  }

  private requireStringClaim(payload: JWTPayload, claim: string, provider: string) {
    const value = payload[claim];

    if (typeof value !== "string" || !value) {
      throw new UnauthorizedException(`${provider} identity payload is missing a required ${claim} claim.`);
    }

    return value;
  }

  private async fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
    const response = await fetch(input, init);
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      const errorMessage =
        (typeof payload?.error_description === "string" && payload.error_description) ||
        (typeof payload?.error === "string" && payload.error) ||
        `${response.status} ${response.statusText}`;
      throw new UnauthorizedException(`OAuth provider request failed: ${errorMessage}`);
    }

    return (payload || {}) as T;
  }
}
