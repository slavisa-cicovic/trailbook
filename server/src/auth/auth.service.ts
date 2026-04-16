import { BadRequestException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { compare, hash } from "bcryptjs";

import { DatabaseService } from "../database/database.service";
import { MailService } from "../mail/mail.service";
import { UsersService } from "../users/users.service";
import type { UserRecord } from "../users/user.types";
import type { ForgotPasswordDto } from "./dto/forgot-password.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { AuthAccessTokenResponse, AuthSessionResponse, AuthUserResponse } from "./auth.types";
import { createOpaqueToken, hashOpaqueToken } from "./auth.utils";

@Injectable()
export class AuthService {
  private readonly sessionTtlDays = Number(process.env.SESSION_TTL_DAYS || 30);
  private readonly accessTokenTtlMinutes = Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 60);
  private readonly passwordResetTtlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);
  private readonly emailVerificationTtlHours = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 24);

  constructor(
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService,
    @Inject(MailService)
    private readonly mailService: MailService,
    @Inject(UsersService)
    private readonly usersService: UsersService,
  ) {}

  async register(input: RegisterDto) {
    if (await this.usersService.findByEmail(input.email)) {
      throw new BadRequestException("Email is already registered.");
    }

    const passwordHash = await hash(input.password, 12);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * this.emailVerificationTtlHours);
    const token = createOpaqueToken();
    const normalizedEmail = input.email.trim().toLowerCase();
    const verifyUrl = this.buildEmailVerificationUrl(token);
    const subject = "Verify your Trailbook email";
    const textBody = [
      "Welcome to Trailbook.",
      "",
      `Verify your email: ${verifyUrl}`,
      "",
      `This link expires at ${expiresAt.toISOString()}.`,
    ].join("\n");
    const htmlBody = [
      "<p>Welcome to Trailbook.</p>",
      `<p><a href="${verifyUrl}">Verify your email</a></p>`,
      `<p>This link expires at ${expiresAt.toISOString()}.</p>`,
    ].join("");

    const { outbox, user } = await this.databaseService.$transaction(async (tx) => {
      const userRecord = await this.usersService.createLocalUser({
        displayName: input.displayName,
        email: normalizedEmail,
        passwordHash,
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: userRecord.id,
          tokenHash: hashOpaqueToken(token),
          expiresAt,
        },
      });

      const createdOutbox = await tx.mailOutbox.create({
        data: {
          userId: userRecord.id,
          toEmail: userRecord.email,
          subject,
          textBody,
          htmlBody,
          status: "pending",
        },
      });

      return { outbox: createdOutbox, user: userRecord };
    });

    await this.mailService.dispatchOutboxMessage(outbox.id);

    return {
      success: true,
      email: user.email,
    };
  }

  async login(input: LoginDto, metadata?: { ipAddress?: string | null; userAgent?: string | null }) {
    const user = await this.usersService.findByEmail(input.email);

    if (!user || !user.passwordHash || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException("Email is not verified.");
    }

    return this.completeLoginForUser(user.id, metadata);
  }

  async logout(sessionToken: string | undefined) {
    if (sessionToken) {
      const session = await this.findSessionByAnyToken(sessionToken);

      if (session) {
        await this.revokeSession(session.id);
      }
    }

    return { success: true };
  }

  async refreshMobileSession(
    refreshToken: string,
    metadata?: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const session = await this.findActiveSessionByRefreshToken(refreshToken);

    if (!session) {
      throw new UnauthorizedException("Refresh token is invalid or expired.");
    }

    const rotatedRefreshToken = createOpaqueToken();
    const nextRefreshExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * this.sessionTtlDays);
    const nextAccessToken = createOpaqueToken();
    const nextAccessExpiresAt = new Date(Date.now() + 1000 * 60 * this.accessTokenTtlMinutes);

    await this.databaseService.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: {
          tokenHash: hashOpaqueToken(rotatedRefreshToken),
          expiresAt: nextRefreshExpiresAt,
          userAgent: metadata?.userAgent || session.userAgent,
          ipAddress: metadata?.ipAddress || session.ipAddress,
        },
      });

      await tx.accessToken.updateMany({
        where: {
          sessionId: session.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await tx.accessToken.create({
        data: {
          sessionId: session.id,
          tokenHash: hashOpaqueToken(nextAccessToken),
          expiresAt: nextAccessExpiresAt,
        },
      });
    });

    const user = await this.usersService.findById(session.userId);

    if (!user) {
      throw new UnauthorizedException("Unable to refresh session for this user.");
    }

    return {
      accessToken: {
        token: nextAccessToken,
        expiresAt: nextAccessExpiresAt.toISOString(),
      },
      session: {
        id: rotatedRefreshToken,
        createdAt: session.createdAt.toISOString(),
        expiresAt: nextRefreshExpiresAt.toISOString(),
      },
      user: this.toAuthUser(user),
    };
  }

  async forgotPassword(input: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(input.email);

    if (!user) {
      return {
        success: true,
      };
    }

    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * this.passwordResetTtlMinutes);
    const resetUrl = this.buildResetUrl(token);
    const subject = "Trailbook password reset";
    const textBody = [
      "We received a request to reset your Trailbook password.",
      "",
      `Reset your password: ${resetUrl}`,
      "",
      `This link expires at ${expiresAt.toISOString()}.`,
    ].join("\n");
    const htmlBody = [
      "<p>We received a request to reset your Trailbook password.</p>",
      `<p><a href="${resetUrl}">Reset your password</a></p>`,
      `<p>This link expires at ${expiresAt.toISOString()}.</p>`,
    ].join("");

    const { outbox } = await this.databaseService.$transaction(async (tx) => {
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          expiresAt,
        },
      });

      const createdOutbox = await tx.mailOutbox.create({
        data: {
          userId: user.id,
          toEmail: user.email,
          subject,
          textBody,
          htmlBody,
          status: "pending",
        },
      });

      return { outbox: createdOutbox };
    });

    await this.mailService.dispatchOutboxMessage(outbox.id);

    return {
      success: true,
    };
  }

  async resetPassword(input: ResetPasswordDto) {
    const request = await this.databaseService.passwordResetToken.findUnique({
      where: {
        tokenHash: hashOpaqueToken(input.token),
      },
    });

    if (!request || request.usedAt) {
      throw new BadRequestException("Reset token is invalid.");
    }

    if (request.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Reset token has expired.");
    }

    const passwordHash = await hash(input.password, 12);

    await this.databaseService.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: request.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: request.id },
        data: { usedAt: new Date() },
      });

      const activeSessions = await tx.session.findMany({
        where: {
          userId: request.userId,
          revokedAt: null,
        },
        select: {
          id: true,
        },
      });

      const activeSessionIds = activeSessions.map((session) => session.id);

      await tx.session.updateMany({
        where: {
          userId: request.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      if (activeSessionIds.length > 0) {
        await tx.accessToken.updateMany({
          where: {
            sessionId: {
              in: activeSessionIds,
            },
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });
      }
    });

    return {
      success: true,
    };
  }

  async verifyEmail(token: string) {
    const request = await this.databaseService.emailVerificationToken.findUnique({
      where: {
        tokenHash: hashOpaqueToken(token),
      },
    });

    if (!request || request.usedAt) {
      throw new BadRequestException("Verification token is invalid.");
    }

    if (request.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Verification token has expired.");
    }

    await this.databaseService.$transaction([
      this.databaseService.user.update({
        where: { id: request.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.databaseService.emailVerificationToken.update({
        where: { id: request.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return {
      success: true,
    };
  }

  async getCurrentUser(sessionToken: string | undefined) {
    if (!sessionToken) {
      return { user: null };
    }

    const session = await this.findSessionByAnyToken(sessionToken);

    if (!session) {
      return { user: null };
    }

    const user = await this.usersService.findById(session.userId);

    return {
      user: user ? this.toAuthUser(user) : null,
    };
  }

  async completeLoginForUser(userId: string, metadata?: { ipAddress?: string | null; userAgent?: string | null }) {
    const loggedInUser = await this.usersService.recordLogin(userId);

    if (!loggedInUser) {
      throw new UnauthorizedException("Unable to establish a session for this user.");
    }

    const { accessToken, session } = await this.createSession(loggedInUser.id, metadata);

    return {
      accessToken,
      session,
      user: this.toAuthUser(loggedInUser),
    };
  }

  private buildResetUrl(token: string) {
    const webAppUrl = process.env.WEB_APP_URL || "http://localhost:3000";
    return `${webAppUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private buildEmailVerificationUrl(token: string) {
    const authBaseUrl = process.env.AUTH_BASE_URL || "http://localhost:3001";
    return `${authBaseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  }

  private async createSession(
    userId: string,
    metadata?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{ accessToken: AuthAccessTokenResponse; session: AuthSessionResponse }> {
    const refreshToken = createOpaqueToken();
    const accessToken = createOpaqueToken();
    const refreshExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * this.sessionTtlDays);
    const accessExpiresAt = new Date(Date.now() + 1000 * 60 * this.accessTokenTtlMinutes);

    const session = await this.databaseService.$transaction(async (tx) => {
      const createdSession = await tx.session.create({
        data: {
          userId,
          tokenHash: hashOpaqueToken(refreshToken),
          expiresAt: refreshExpiresAt,
          userAgent: metadata?.userAgent || null,
          ipAddress: metadata?.ipAddress || null,
        },
      });

      await tx.accessToken.create({
        data: {
          sessionId: createdSession.id,
          tokenHash: hashOpaqueToken(accessToken),
          expiresAt: accessExpiresAt,
        },
      });

      return createdSession;
    });

    return {
      accessToken: {
        token: accessToken,
        expiresAt: accessExpiresAt.toISOString(),
      },
      session: {
        id: refreshToken,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
      },
    };
  }

  private async findActiveSessionByRefreshToken(refreshToken: string) {
    const session = await this.databaseService.session.findUnique({
      where: {
        tokenHash: hashOpaqueToken(refreshToken),
      },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      return null;
    }

    return session;
  }

  private async findSessionByAnyToken(token: string) {
    const accessToken = await this.databaseService.accessToken.findUnique({
      where: {
        tokenHash: hashOpaqueToken(token),
      },
      include: {
        session: true,
      },
    });

    if (
      accessToken &&
      !accessToken.revokedAt &&
      accessToken.expiresAt.getTime() >= Date.now() &&
      !accessToken.session.revokedAt &&
      accessToken.session.expiresAt.getTime() >= Date.now()
    ) {
      return accessToken.session;
    }

    return this.findActiveSessionByRefreshToken(token);
  }

  private async revokeSession(sessionId: string) {
    await this.databaseService.$transaction([
      this.databaseService.session.updateMany({
        where: {
          id: sessionId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
      this.databaseService.accessToken.updateMany({
        where: {
          sessionId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);
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
