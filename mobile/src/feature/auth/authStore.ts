import { create } from 'zustand';
import type { SocialProvider } from '@/core/auth/AuthRepository';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';

export type AuthStatus = 'loading' | 'authenticated' | 'demo' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  displayName: string | null;
  email: string | null;
  isDemo: boolean;
  role: string | null;
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
  email: null,
  isDemo: false,
  role: null,

  async init() {
    const { status, displayName, email, role } = await authRepository.init();
    set({ status, displayName, email, isDemo: status === 'demo', role });
  },

  async loginWithSocial(provider, idToken) {
    const result = await authRepository.loginWithSocial(provider, idToken);
    if (!result.ok) return err(result.error);
    set({
      status: 'authenticated',
      displayName: result.value.displayName,
      email: result.value.email,
      isDemo: false,
      role: result.value.role,
    });
    return ok(undefined);
  },

  async loginAsDemo() {
    await authRepository.loginAsDemo();
    set({
      status: 'demo',
      displayName: 'Demo User',
      email: null,
      isDemo: true,
      role: null,
    });
  },

  async logout() {
    await authRepository.logout();
    set({
      status: 'unauthenticated',
      displayName: null,
      email: null,
      isDemo: false,
      role: null,
    });
  },
}));
