import { gzipSync, strToU8 } from 'fflate';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { API_BASE_URL } from './apiConfig';
import {
  apiNetworkErrorMessage,
  apiResponseErrorMessage,
  SESSION_EXPIRED_MESSAGE,
} from './apiError';

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

interface ApiAuthTokenProvider {
  getAccessToken(): Promise<string | null>;
  refreshAccessToken(): Promise<Result<string>>;
}

let authTokenProvider: ApiAuthTokenProvider | null = null;

export function setApiAuthTokenProvider(provider: ApiAuthTokenProvider): void {
  authTokenProvider = provider;
}

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
    if (!authTokenProvider) return err(SESSION_EXPIRED_MESSAGE);
    const refreshResult = await authTokenProvider.refreshAccessToken();
    if (!refreshResult.ok) return err(SESSION_EXPIRED_MESSAGE);

    const retryHeaders = { ...headers, Authorization: `Bearer ${refreshResult.value}` };
    const retryRes = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...options,
      headers: retryHeaders,
    });
    if (!retryRes.ok) {
      return err(await apiResponseErrorMessage(retryRes));
    }
    if (retryRes.status === 204) return ok(undefined as T);
    return ok((await retryRes.json()) as T);
  }

  if (!res.ok) {
    return err(await apiResponseErrorMessage(res));
  }
  if (res.status === 204) return ok(undefined as T);
  return ok((await res.json()) as T);
}

async function withToken<T>(
  fn: (token: string) => Promise<Result<T>>,
): Promise<Result<T>> {
  if (!authTokenProvider) return err(SESSION_EXPIRED_MESSAGE);
  const token = await authTokenProvider.getAccessToken();
  if (!token) return err(SESSION_EXPIRED_MESSAGE);
  try {
    return await fn(token);
  } catch {
    return err(apiNetworkErrorMessage());
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

export function apiDelete<T>(path: string, body?: unknown): Promise<Result<T>> {
  return withToken((token) =>
    doRequest<T>(
      path,
      {
        method: 'DELETE',
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      token,
    ),
  );
}
