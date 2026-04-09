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
import type { AuthUserResponse } from "./auth.types";
import { createOpaqueToken, hashOpaqueToken } from "./auth.utils";

@Injectable()
export class AuthService {
  private readonly sessionTtlDays = Number(process.env.SESSION_TTL_DAYS || 30);
  private readonly passwordResetTtlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);

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
    const user = await this.usersService.createLocalUser({
      displayName: input.displayName,
      email: input.email,
      passwordHash,
    });

    return {
      user: this.toAuthUser(user),
    };
  }

  async login(input: LoginDto, metadata?: { ipAddress?: string | null; userAgent?: string | null }) {
    const user = await this.usersService.findByEmail(input.email);

    if (!user || !user.passwordHash || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password.");
    }

    const loggedInUser = (await this.usersService.recordLogin(user.id)) ?? user;
    const session = await this.createSession(loggedInUser.id, metadata);

    return {
      session,
      user: this.toAuthUser(loggedInUser),
    };
  }

  async logout(sessionToken: string | undefined) {
    if (sessionToken) {
      await this.databaseService.session.updateMany({
        where: {
          tokenHash: hashOpaqueToken(sessionToken),
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return { success: true };
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

    await this.databaseService.$transaction([
      this.databaseService.user.update({
        where: { id: request.userId },
        data: { passwordHash },
      }),
      this.databaseService.passwordResetToken.update({
        where: { id: request.id },
        data: { usedAt: new Date() },
      }),
      this.databaseService.session.updateMany({
        where: {
          userId: request.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
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

    const session = await this.databaseService.session.findUnique({
      where: {
        tokenHash: hashOpaqueToken(sessionToken),
      },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      return { user: null };
    }

    const user = await this.usersService.findById(session.userId);

    return {
      user: user ? this.toAuthUser(user) : null,
    };
  }

  beginSocialLogin(provider: "google" | "facebook" | "apple") {
    return {
      provider,
      status: "not_implemented",
      note: "OAuth callback integration is reserved after persistent local auth lands.",
    };
  }

  private buildResetUrl(token: string) {
    const webAppUrl = process.env.WEB_APP_URL || "http://localhost:3000";
    return `${webAppUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private async createSession(userId: string, metadata?: { ipAddress?: string | null; userAgent?: string | null }) {
    const token = createOpaqueToken();
    const session = await this.databaseService.session.create({
      data: {
        userId,
        tokenHash: hashOpaqueToken(token),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * this.sessionTtlDays),
        userAgent: metadata?.userAgent || null,
        ipAddress: metadata?.ipAddress || null,
      },
    });

    return {
      id: token,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    };
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
