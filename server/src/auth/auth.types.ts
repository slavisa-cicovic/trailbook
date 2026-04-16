import type { AuthProvider, UserRole } from "../users/user.types";

export interface AuthUserResponse {
  displayName: string;
  email: string;
  id: string;
  providers: AuthProvider[];
  role: UserRole;
}

export interface AuthAccessTokenResponse {
  token: string;
  expiresAt: string;
}

export interface AuthSessionResponse {
  id: string;
  createdAt: string;
  expiresAt: string;
}
