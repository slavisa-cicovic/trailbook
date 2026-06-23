import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { SignJWT, jwtVerify } from "jose";
import type { Request } from "express";

import { DatabaseService } from "../database/database.service";
import type { SocialLoginRequest } from "./auth.controller";

const DEBUG_PREFIX = "debug-login:";

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

  async loginWithSocial(input: SocialLoginRequest) {
    const email = this.decodeEmail(input.provider, input.idToken);
    if (!email) {
      throw new UnauthorizedException("Invalid token");
    }

    const user = await this.database.user.findUnique({ where: { email } });
    if (!user) {
      throw new ForbiddenException("Access not allowed");
    }

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
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        provider: input.provider,
      },
    };
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
    const token = this.getBearerToken(request);
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const claims = await this.verifyAccessToken(token);
    const userId = String(claims.sub || "");
    if (!userId) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }

  private decodeEmail(provider: string, idToken: string) {
    if (provider !== "DEBUG" || !idToken.startsWith(DEBUG_PREFIX)) {
      return null;
    }

    const email = idToken.slice(DEBUG_PREFIX.length).trim();
    return email.length > 0 ? email : null;
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

  private getBearerToken(request: Request) {
    const header = request.get("authorization");
    return header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  }

  private getJwtSecret() {
    return new TextEncoder().encode(process.env.JWT_SECRET || "trailbook-local-dev-secret-change-me");
  }
}
