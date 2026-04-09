import { Inject, Injectable } from "@nestjs/common";
import type { AuthProvider as PrismaAuthProvider, User as PrismaUser } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { AuthProvider, CreateLocalUserInput, UserRecord } from "./user.types";

@Injectable()
export class UsersService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      include: { externalIdentities: true },
    });

    return user ? this.toUserRecord(user) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.databaseService.user.findUnique({
      where: { email: this.normalizeEmail(email) },
      include: { externalIdentities: true },
    });

    return user ? this.toUserRecord(user) : null;
  }

  async createLocalUser(input: CreateLocalUserInput): Promise<UserRecord> {
    const normalizedEmail = this.normalizeEmail(input.email);
    const normalizedDisplayName = input.displayName.trim();

    const user = await this.databaseService.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          displayName: normalizedDisplayName,
          passwordHash: input.passwordHash,
        },
      });

      await tx.externalIdentity.create({
        data: {
          userId: createdUser.id,
          provider: "local",
          providerSubject: normalizedEmail,
          email: normalizedEmail,
        },
      });

      const demoPlan = await tx.plan.upsert({
        where: { code: "demo" },
        update: {},
        create: {
          code: "demo",
          name: "Demo",
          billingType: "none",
        },
      });

      await tx.subscription.create({
        data: {
          userId: createdUser.id,
          planId: demoPlan.id,
          status: "active",
          startedAt: new Date(),
        },
      });

      return tx.user.findUniqueOrThrow({
        where: { id: createdUser.id },
        include: { externalIdentities: true },
      });
    });

    return this.toUserRecord(user);
  }

  async recordLogin(userId: string): Promise<UserRecord | null> {
    const user = await this.databaseService.user
      .update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
        include: { externalIdentities: true },
      })
      .catch(() => null);

    return user ? this.toUserRecord(user) : null;
  }

  async attachProvider(userId: string, provider: AuthProvider): Promise<UserRecord | null> {
    const existingUser = await this.findById(userId);

    if (!existingUser || existingUser.authProviderSummary.includes(provider)) {
      return existingUser;
    }

    const user = await this.databaseService.$transaction(async (tx) => {
      await tx.externalIdentity.create({
        data: {
          userId,
          provider: provider as PrismaAuthProvider,
          providerSubject: `${provider}:${userId}`,
        },
      });

      return tx.user.findUniqueOrThrow({
        where: { id: userId },
        include: { externalIdentities: true },
      });
    });

    return this.toUserRecord(user);
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private toUserRecord(
    user: PrismaUser & {
      externalIdentities: Array<{ provider: PrismaAuthProvider }>;
    },
  ): UserRecord {
    const providers = Array.from(
      new Set<AuthProvider>(user.externalIdentities.map((identity) => identity.provider as AuthProvider)),
    );

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      passwordHash: user.passwordHash,
      authProviderSummary: providers,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    };
  }
}
