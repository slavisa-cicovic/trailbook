import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import type { AuthenticatedUserSummary, AuthProvider } from "../../domain/identity";

export interface MobileAuthResult {
  sessionToken: string;
  sessionExpiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  user: AuthenticatedUserSummary;
}

export interface RegisterResult {
  success: boolean;
  email: string;
}

type SocialAuthProvider = Exclude<AuthProvider, "local">;

WebBrowser.maybeCompleteAuthSession();

function getApiBaseUrl() {
  const configuredBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_SERVER_API_URL;

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return "http://localhost:3001/api";
}

async function request<T>(path: string, init?: RequestInit, sessionToken?: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(sessionToken
          ? {
              Authorization: `Bearer ${sessionToken}`,
            }
          : {}),
        ...(init?.headers || {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Trailbook could not reach the server in time.");
    }

    throw new Error("Trailbook could not connect to the server.");
  }

  clearTimeout(timeoutId);

  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } & T | null;

  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (payload || {}) as T;
}

export async function registerWithBackend(input: {
  displayName: string;
  email: string;
  password: string;
}) {
  return request<RegisterResult>("/auth/mobile/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loginWithBackend(input: { email: string; password: string }) {
  return request<MobileAuthResult>("/auth/mobile/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function refreshMobileSessionWithBackend(refreshToken: string) {
  return request<MobileAuthResult>("/auth/mobile/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logoutFromBackend(sessionToken: string) {
  return request<{ success: boolean }>(
    "/auth/mobile/logout",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    sessionToken,
  );
}

export async function getCurrentBackendUser(sessionToken: string) {
  return request<{ user: AuthenticatedUserSummary | null }>("/auth/mobile/me", { method: "GET" }, sessionToken);
}

export async function forgotPasswordWithBackend(email: string) {
  return request<{ success: boolean }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function getMobileSocialProviderAvailability() {
  return request<Record<SocialAuthProvider, boolean>>("/auth/providers", {
    method: "GET",
  });
}

export async function signInWithSocialProvider(provider: SocialAuthProvider) {
  const redirectUri = Linking.createURL("/auth/callback");
  const startUrl = `${getApiBaseUrl()}/auth/mobile/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}`;
  const result = await WebBrowser.openAuthSessionAsync(startUrl, redirectUri);

  if (result.type !== "success" || !result.url) {
    throw new Error("Social sign-in was cancelled.");
  }

  const parsedUrl = Linking.parse(result.url);
  const queryParams = parsedUrl.queryParams || {};
  const error = typeof queryParams.error === "string" ? queryParams.error : null;
  const handoffCode = typeof queryParams.handoffCode === "string" ? queryParams.handoffCode : null;

  if (error) {
    throw new Error(error.replace(/_/g, " "));
  }

  if (!handoffCode) {
    throw new Error("Social sign-in did not return a valid handoff code.");
  }

  return request<MobileAuthResult>("/auth/mobile/social/complete", {
    method: "POST",
    body: JSON.stringify({ handoffCode }),
  });
}
