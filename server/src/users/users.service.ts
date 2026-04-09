import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, AuthProvider as PrismaAuthProvider, User as PrismaUser } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type {
  AuthProvider,
  CreateLocalUserInput,
  CreateSocialUserInput,
  ExternalIdentityInput,
  UserRecord,
} from "./user.types";

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

  async findByExternalIdentity(provider: Exclude<AuthProvider, "local">, providerSubject: string): Promise<UserRecord | null> {
    const identity = await this.databaseService.externalIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: provider as PrismaAuthProvider,
          providerSubject,
        },
      },
      include: {
        user: {
          include: {
            externalIdentities: true,
          },
        },
      },
    });

    return identity?.user ? this.toUserRecord(identity.user) : null;
  }

  async createLocalUser(input: CreateLocalUserInput): Promise<UserRecord> {
    const normalizedEmail = this.normalizeEmail(input.email);
    const normalizedDisplayName = input.displayName.trim();

    const user = await this.databaseService.$transaction((tx) =>
      this.createUserWithInitialIdentity(
        tx,
        {
          displayName: normalizedDisplayName,
          email: normalizedEmail,
          passwordHash: input.passwordHash,
        },
        {
          provider: "local",
          providerSubject: normalizedEmail,
          email: normalizedEmail,
        },
      ),
    );

    return this.toUserRecord(user);
  }

  async createSocialUser(input: CreateSocialUserInput): Promise<UserRecord> {
    const normalizedEmail = this.normalizeEmail(input.email);
    const normalizedDisplayName = input.displayName.trim();

    const user = await this.databaseService.$transaction((tx) =>
      this.createUserWithInitialIdentity(
        tx,
        {
          displayName: normalizedDisplayName,
          email: normalizedEmail,
          passwordHash: null,
        },
        {
          provider: input.provider,
          providerSubject: input.providerSubject,
          email: normalizedEmail,
        },
      ),
    );

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

  async linkExternalIdentity(userId: string, identity: ExternalIdentityInput): Promise<UserRecord | null> {
    const existingUser = await this.findById(userId);

    if (!existingUser) {
      return null;
    }

    const user = await this.databaseService.$transaction(async (tx) => {
      await tx.externalIdentity.upsert({
        where: {
          provider_providerSubject: {
            provider: identity.provider as PrismaAuthProvider,
            providerSubject: identity.providerSubject,
          },
        },
        create: {
          userId,
          provider: identity.provider as PrismaAuthProvider,
          providerSubject: identity.providerSubject,
          email: identity.email ? this.normalizeEmail(identity.email) : null,
        },
        update: {
          userId,
          email: identity.email ? this.normalizeEmail(identity.email) : null,
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

  private async createUserWithInitialIdentity(
    transaction: Prisma.TransactionClient,
    userInput: {
      displayName: string;
      email: string;
      passwordHash: string | null;
    },
    identityInput: {
      email: string | null;
      provider: AuthProvider;
      providerSubject: string;
    },
  ) {
    const createdUser = await transaction.user.create({
      data: {
        email: userInput.email,
        displayName: userInput.displayName,
        passwordHash: userInput.passwordHash,
      },
    });

    await transaction.externalIdentity.create({
      data: {
        userId: createdUser.id,
        provider: identityInput.provider as PrismaAuthProvider,
        providerSubject: identityInput.providerSubject,
        email: identityInput.email,
      },
    });

    const demoPlan = await transaction.plan.upsert({
      where: { code: "demo" },
      update: {},
      create: {
        code: "demo",
        name: "Demo",
        billingType: "none",
      },
    });

    await transaction.subscription.create({
      data: {
        userId: createdUser.id,
        planId: demoPlan.id,
        status: "active",
        startedAt: new Date(),
      },
    });

    return transaction.user.findUniqueOrThrow({
      where: { id: createdUser.id },
      include: { externalIdentities: true },
    });
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
