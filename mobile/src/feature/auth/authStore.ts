import { create } from 'zustand';
import type { SocialProvider } from '@/core/auth/AuthRepository';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';

export type AuthStatus = 'loading' | 'authenticated' | 'demo' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  displayName: string | null;
  isDemo: boolean;
}

interface AuthActions {
  init(): Promise<void>;
  loginWithSocial(provider: SocialProvider, idToken: string): Promise<Result<void>>;
  loginAsDemo(): Promise<void>;
  logout(): Promise<void>;
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  status: 'loading',
  displayName: null,
  isDemo: false,

  async init() {
    const { status, displayName } = await authRepository.init();
    set({ status, displayName, isDemo: status === 'demo' });
  },

  async loginWithSocial(provider, idToken) {
    const result = await authRepository.loginWithSocial(provider, idToken);
    if (!result.ok) return err(result.error);
    set({
      status: 'authenticated',
      displayName: result.value.displayName,
      isDemo: false,
    });
    return ok(undefined);
  },

  async loginAsDemo() {
    await authRepository.loginAsDemo();
    set({ status: 'demo', displayName: 'Demo User', isDemo: true });
  },

  async logout() {
    await authRepository.logout();
    set({ status: 'unauthenticated', displayName: null, isDemo: false });
  },
}));
