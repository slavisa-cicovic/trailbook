import * as SecureStore from 'expo-secure-store';
import type { AuthRepository, AuthUser, SocialProvider } from './AuthRepository';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import * as authApiClient from '@/core/data/remote/authApiClient';

const KEYS = {
  accessToken: 'trailbook.access_token',
  refreshToken: 'trailbook.refresh_token',
  isDemo: 'trailbook.is_demo',
  displayName: 'trailbook.display_name',
  role: 'trailbook.role',
} as const;

export class SecureStoreAuthRepository implements AuthRepository {
  async loginWithSocial(provider: SocialProvider, idToken: string): Promise<Result<AuthUser>> {
    const result = await authApiClient.loginWithSocial(provider, idToken);
    if (!result.ok) return err(result.error);
    const { accessToken, refreshToken, user } = result.value;
    await this.saveTokens(accessToken, refreshToken);
    await SecureStore.setItemAsync(KEYS.displayName, user.displayName);
    await SecureStore.setItemAsync(KEYS.role, user.role);
    await SecureStore.deleteItemAsync(KEYS.isDemo);
    return ok({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
  }

  async loginAsDemo(): Promise<void> {
    await SecureStore.setItemAsync(KEYS.isDemo, 'true');
    await SecureStore.setItemAsync(KEYS.displayName, 'Demo User');
    await SecureStore.deleteItemAsync(KEYS.role);
    await SecureStore.deleteItemAsync(KEYS.accessToken);
    await SecureStore.deleteItemAsync(KEYS.refreshToken);
  }

  async logout(): Promise<void> {
    const rt = await SecureStore.getItemAsync(KEYS.refreshToken);
    if (rt) await authApiClient.logoutRemote(rt);
    await SecureStore.deleteItemAsync(KEYS.accessToken);
    await SecureStore.deleteItemAsync(KEYS.refreshToken);
    await SecureStore.deleteItemAsync(KEYS.isDemo);
    await SecureStore.deleteItemAsync(KEYS.displayName);
    await SecureStore.deleteItemAsync(KEYS.role);
  }

  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.accessToken);
  }

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.refreshToken);
  }

  async saveTokens(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.accessToken, accessToken);
    await SecureStore.setItemAsync(KEYS.refreshToken, refreshToken);
  }

  async refreshAccessToken(): Promise<Result<string>> {
    const rt = await SecureStore.getItemAsync(KEYS.refreshToken);
    if (!rt) return err('No refresh token stored');
    const result = await authApiClient.refreshToken(rt);
    if (!result.ok) return err(result.error);
    await SecureStore.setItemAsync(KEYS.accessToken, result.value.accessToken);
    return ok(result.value.accessToken);
  }

  async isDemo(): Promise<boolean> {
    return (await SecureStore.getItemAsync(KEYS.isDemo)) === 'true';
  }

  async getDisplayName(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.displayName);
  }

  async init(): Promise<{
    status: 'authenticated' | 'demo' | 'unauthenticated';
    displayName: string | null;
    role: string | null;
  }> {
    const [isDemo, accessToken, displayName, role] = await Promise.all([
      SecureStore.getItemAsync(KEYS.isDemo),
      SecureStore.getItemAsync(KEYS.accessToken),
      SecureStore.getItemAsync(KEYS.displayName),
      SecureStore.getItemAsync(KEYS.role),
    ]);
    if (isDemo === 'true') return { status: 'demo', displayName, role: null };
    if (accessToken) return { status: 'authenticated', displayName, role };
    return { status: 'unauthenticated', displayName: null, role: null };
  }
}

export const authRepository = new SecureStoreAuthRepository();
