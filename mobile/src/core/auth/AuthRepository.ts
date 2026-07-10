import type { Result } from '@/core/common/result';

export type SocialProvider = 'GOOGLE' | 'APPLE' | 'FACEBOOK' | 'DEBUG';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface AuthRepository {
  loginWithSocial(provider: SocialProvider, idToken: string): Promise<Result<AuthUser>>;
  loginWithOAuthSession(input: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  }): Promise<Result<AuthUser>>;
  loginAsDemo(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  saveTokens(accessToken: string, refreshToken: string): Promise<void>;
  refreshAccessToken(): Promise<Result<string>>;
  isDemo(): Promise<boolean>;
  getLocalUserId(): Promise<string | null>;
  getDisplayName(): Promise<string | null>;
  init(): Promise<{
    status: 'authenticated' | 'demo' | 'unauthenticated';
    userId: string | null;
    displayName: string | null;
    email: string | null;
    role: string | null;
  }>;
}
