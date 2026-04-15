export type UserRole = "user" | "admin";

export type AuthProvider = "local" | "google" | "facebook" | "apple";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string | null;
  emailVerifiedAt: string | null;
  authProviderSummary: AuthProvider[];
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface CreateLocalUserInput {
  displayName: string;
  email: string;
  passwordHash: string;
}

export interface ExternalIdentityInput {
  email?: string | null;
  provider: Exclude<AuthProvider, "local">;
  providerSubject: string;
}

export interface CreateSocialUserInput extends ExternalIdentityInput {
  displayName: string;
  email: string;
}
