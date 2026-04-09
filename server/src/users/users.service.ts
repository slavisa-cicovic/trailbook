import { Injectable } from "@nestjs/common";

import type { AuthProvider, UserRecord } from "./user.types";

@Injectable()
export class UsersService {
  private readonly users = new Map<string, UserRecord>();

  findById(userId: string): UserRecord | null {
    return this.users.get(userId) ?? null;
  }

  findByEmail(email: string): UserRecord | null {
    const normalizedEmail = email.trim().toLowerCase();

    for (const user of this.users.values()) {
      if (user.email === normalizedEmail) {
        return user;
      }
    }

    return null;
  }

  createLocalUser(input: { displayName: string; email: string; passwordHash: string }): UserRecord {
    const timestamp = new Date().toISOString();
    const user: UserRecord = {
      id: `user-${timestamp}`,
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      role: "user",
      passwordHash: input.passwordHash,
      authProviderSummary: ["local"],
      createdAt: timestamp,
      updatedAt: timestamp,
      lastLoginAt: null,
    };

    this.users.set(user.id, user);
    return user;
  }

  recordLogin(userId: string): UserRecord | null {
    const user = this.users.get(userId);

    if (!user) {
      return null;
    }

    const updatedUser: UserRecord = {
      ...user,
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  attachProvider(userId: string, provider: AuthProvider): UserRecord | null {
    const user = this.users.get(userId);

    if (!user || user.authProviderSummary.includes(provider)) {
      return user ?? null;
    }

    const updatedUser: UserRecord = {
      ...user,
      authProviderSummary: [...user.authProviderSummary, provider],
      updatedAt: new Date().toISOString(),
    };

    this.users.set(userId, updatedUser);
    return updatedUser;
  }
}
