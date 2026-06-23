import * as SecureStore from 'expo-secure-store';
import type { AuthRepository, AuthUser, SocialProvider } from './AuthRepository';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import * as authApiClient from '@/core/data/remote/authApiClient';

const KEYS = {
  accessToken: 'vellora.access_token',
  refreshToken: 'vellora.refresh_token',
  isDemo: 'vellora.is_demo',
  displayName: 'vellora.display_name',
} as const;

export class SecureStoreAuthRepository implements AuthRepository {
  async loginWithSocial(provider: SocialProvider, idToken: string): Promise<Result<AuthUser>> {
    const result = await authApiClient.loginWithSocial(provider, idToken);
    if (!result.ok) return err(result.error);
    const { accessToken, refreshToken, user } = result.value;
    await this.saveTokens(accessToken, refreshToken);
    await SecureStore.setItemAsync(KEYS.displayName, user.displayName);
    await SecureStore.deleteItemAsync(KEYS.isDemo);
    return ok({ id: user.id, email: user.email, displayName: user.displayName });
  }

  async loginAsDemo(): Promise<void> {
    await SecureStore.setItemAsync(KEYS.isDemo, 'true');
    await SecureStore.setItemAsync(KEYS.displayName, 'Demo User');
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
  }> {
    const [isDemo, accessToken, displayName] = await Promise.all([
      SecureStore.getItemAsync(KEYS.isDemo),
      SecureStore.getItemAsync(KEYS.accessToken),
      SecureStore.getItemAsync(KEYS.displayName),
    ]);
    if (isDemo === 'true') return { status: 'demo', displayName };
    if (accessToken) return { status: 'authenticated', displayName };
    return { status: 'unauthenticated', displayName: null };
  }
}

export const authRepository = new SecureStoreAuthRepository();
