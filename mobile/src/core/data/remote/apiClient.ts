import { gzipSync, strToU8 } from 'fflate';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { API_BASE_URL } from './apiConfig';

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Network request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function doRequest<T>(
  path: string,
  options: RequestInit,
  token: string,
): Promise<Result<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refreshResult = await authRepository.refreshAccessToken();
    if (!refreshResult.ok) return err(`Unauthorized: ${refreshResult.error}`);

    const retryHeaders = { ...headers, Authorization: `Bearer ${refreshResult.value}` };
    const retryRes = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...options,
      headers: retryHeaders,
    });
    if (!retryRes.ok) {
      const text = await retryRes.text().catch(() => retryRes.status.toString());
      return err(`HTTP ${retryRes.status}: ${text}`);
    }
    if (retryRes.status === 204) return ok(undefined as T);
    return ok((await retryRes.json()) as T);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    return err(`HTTP ${res.status}: ${text}`);
  }
  if (res.status === 204) return ok(undefined as T);
  return ok((await res.json()) as T);
}

async function withToken<T>(
  fn: (token: string) => Promise<Result<T>>,
): Promise<Result<T>> {
  const token = await authRepository.getAccessToken();
  if (!token) return err('No access token');
  try {
    return await fn(token);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export function apiPost<T>(path: string, body: unknown): Promise<Result<T>> {
  return withToken((token) =>
    doRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }, token),
  );
}

export function apiPostGzip<T>(path: string, body: unknown): Promise<Result<T>> {
  return withToken((token) => {
    const json = JSON.stringify(body);
    const gzipped = gzipSync(strToU8(json));
    const gzippedBody = gzipped.buffer.slice(
      gzipped.byteOffset,
      gzipped.byteOffset + gzipped.byteLength,
    );

    return doRequest<T>(
      path,
      {
        method: 'POST',
        body: gzippedBody,
        headers: {
          'Content-Encoding': 'gzip',
          'Content-Type': 'application/json',
        },
      },
      token,
    );
  });
}

export function apiGet<T>(path: string): Promise<Result<T>> {
  return withToken((token) => doRequest<T>(path, { method: 'GET' }, token));
}

export function apiDelete<T>(path: string): Promise<Result<T>> {
  return withToken((token) => doRequest<T>(path, { method: 'DELETE' }, token));
}
