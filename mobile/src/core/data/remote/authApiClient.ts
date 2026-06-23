import type { SocialProvider } from '@/core/auth/AuthRepository';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { API_BASE_URL } from './apiConfig';

interface SocialLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; displayName: string; role: string; provider: string };
}

interface RefreshResponse {
  accessToken: string;
}

async function post<T>(path: string, body: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.status.toString());
      return err(`HTTP ${res.status}: ${text}`);
    }
    return ok((await res.json()) as T);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function loginWithSocial(
  provider: SocialProvider,
  idToken: string,
): Promise<Result<SocialLoginResponse>> {
  return post<SocialLoginResponse>('/auth/social', { provider, idToken });
}

export async function refreshToken(refreshTokenValue: string): Promise<Result<RefreshResponse>> {
  return post<RefreshResponse>('/auth/refresh', { refreshToken: refreshTokenValue });
}

export async function logoutRemote(refreshTokenValue: string): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: refreshTokenValue }),
  }).catch(() => {});
}
