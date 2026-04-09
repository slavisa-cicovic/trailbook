export type UserRole = "user" | "admin";

export type AuthProvider = "local" | "google" | "facebook" | "apple";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  passwordHash: string | null;
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
