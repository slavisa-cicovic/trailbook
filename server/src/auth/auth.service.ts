import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";

import { UsersService } from "../users/users.service";
import type { UserRecord } from "../users/user.types";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";

interface AuthUserResponse {
  displayName: string;
  email: string;
  id: string;
  providers: UserRecord["authProviderSummary"];
  role: UserRecord["role"];
}

interface SessionRecord {
  createdAt: string;
  expiresAt: string;
  id: string;
  revokedAt: string | null;
  userId: string;
}

@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly passwordResetRequests = new Map<string, { expiresAt: string; token: string; userId: string }>();

  constructor(private readonly usersService: UsersService) {}

  register(input: RegisterDto) {
    if (this.usersService.findByEmail(input.email)) {
      throw new BadRequestException("Email is already registered.");
    }

    const user = this.usersService.createLocalUser({
      displayName: input.displayName,
      email: input.email,
      passwordHash: `dev-hash:${input.password}`,
    });

    return {
      user: this.toAuthUser(user),
    };
  }

  login(input: LoginDto) {
    const user = this.usersService.findByEmail(input.email);

    if (!user || user.passwordHash !== `dev-hash:${input.password}`) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const loggedInUser = this.usersService.recordLogin(user.id) ?? user;
    const session = this.createSession(loggedInUser.id);

    return {
      session,
      user: this.toAuthUser(loggedInUser),
    };
  }

  logout(sessionId: string | undefined) {
    if (sessionId) {
      const session = this.sessions.get(sessionId);

      if (session) {
        this.sessions.set(sessionId, {
          ...session,
          revokedAt: new Date().toISOString(),
        });
      }
    }

    return { success: true };
  }

  forgotPassword(input: ForgotPasswordDto) {
    const user = this.usersService.findByEmail(input.email);

    if (!user) {
      return {
        success: true,
      };
    }

    const token = `reset-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();

    this.passwordResetRequests.set(token, {
      token,
      userId: user.id,
      expiresAt,
    });

    return {
      success: true,
      tokenPreview: token,
      expiresAt,
    };
  }

  resetPassword(input: ResetPasswordDto) {
    const request = this.passwordResetRequests.get(input.token);

    if (!request) {
      throw new BadRequestException("Reset token is invalid.");
    }

    if (new Date(request.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException("Reset token has expired.");
    }

    this.passwordResetRequests.delete(input.token);

    return {
      success: true,
      note: "Password reset flow is scaffolded. Persistence update is intentionally deferred.",
    };
  }

  getCurrentUser(sessionId: string | undefined) {
    if (!sessionId) {
      return { user: null };
    }

    const session = this.sessions.get(sessionId);

    if (!session || session.revokedAt) {
      return { user: null };
    }

    const user = this.usersService.findById(session.userId);

    return {
      user: user ? this.toAuthUser(user) : null,
    };
  }

  beginSocialLogin(provider: "google" | "facebook" | "apple") {
    return {
      provider,
      status: "not_implemented",
      note: "OAuth callback integration is reserved in the auth bootstrap but not implemented yet.",
    };
  }

  private createSession(userId: string) {
    const createdAt = new Date().toISOString();
    const session: SessionRecord = {
      id: `session-${createdAt}`,
      userId,
      createdAt,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      revokedAt: null,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  private toAuthUser(user: UserRecord): AuthUserResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      providers: user.authProviderSummary,
    };
  }
}
