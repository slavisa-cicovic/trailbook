import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import type { AuthenticatedUserSummary, AuthProvider } from "../../domain/identity";
import { requestFromBackend } from "../api/mobile-api.service";

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

export async function registerWithBackend(input: {
  displayName: string;
  email: string;
  password: string;
}) {
  return requestFromBackend<RegisterResult>("/auth/mobile/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loginWithBackend(input: { email: string; password: string }) {
  return requestFromBackend<MobileAuthResult>("/auth/mobile/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function refreshMobileSessionWithBackend(refreshToken: string) {
  return requestFromBackend<MobileAuthResult>("/auth/mobile/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logoutFromBackend(sessionToken: string) {
  return requestFromBackend<{ success: boolean }>(
    "/auth/mobile/logout",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    sessionToken,
  );
}

export async function getCurrentBackendUser(sessionToken: string) {
  return requestFromBackend<{ user: AuthenticatedUserSummary | null }>(
    "/auth/mobile/me",
    { method: "GET" },
    sessionToken,
  );
}

export async function forgotPasswordWithBackend(email: string) {
  return requestFromBackend<{ success: boolean }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function getMobileSocialProviderAvailability() {
  return requestFromBackend<Record<SocialAuthProvider, boolean>>("/auth/providers", {
    method: "GET",
  });
}

export async function signInWithSocialProvider(provider: SocialAuthProvider) {
  const redirectUri = Linking.createURL("/auth/callback");
  const startUrl = `${process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_SERVER_API_URL || "http://localhost:3001/api"}/auth/mobile/${provider}?redirect_uri=${encodeURIComponent(redirectUri)}`;
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

  return requestFromBackend<MobileAuthResult>("/auth/mobile/social/complete", {
    method: "POST",
    body: JSON.stringify({ handoffCode }),
  });
}
