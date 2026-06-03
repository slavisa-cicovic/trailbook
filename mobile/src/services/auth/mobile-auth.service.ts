import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import type { AuthenticatedUserSummary, AuthProvider } from "../../domain/identity";
import { API_ROUTES } from "../../constants/api-routes";
import { getApiBaseUrl, requestFromBackend } from "../api/mobile-api.service";
import {
  AuthenticatedUserSummarySchema,
  GetCurrentUserResponseSchema,
  MobileAuthResultSchema,
} from "../api/schemas/auth.schemas";

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
  return requestFromBackend<RegisterResult>(API_ROUTES.auth.register, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loginWithBackend(input: { email: string; password: string }) {
  return requestFromBackend(API_ROUTES.auth.login, {
    method: "POST",
    body: JSON.stringify(input),
  }, undefined, MobileAuthResultSchema);
}

export async function refreshMobileSessionWithBackend(refreshToken: string) {
  return requestFromBackend(API_ROUTES.auth.refresh, {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  }, undefined, MobileAuthResultSchema);
}

export async function logoutFromBackend(sessionToken: string) {
  return requestFromBackend<{ success: boolean }>(
    API_ROUTES.auth.logout,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    sessionToken,
  );
}

export async function getCurrentBackendUser(sessionToken: string) {
  return requestFromBackend(
    API_ROUTES.auth.me,
    { method: "GET" },
    sessionToken,
    GetCurrentUserResponseSchema,
  );
}

export async function forgotPasswordWithBackend(email: string) {
  return requestFromBackend<{ success: boolean }>(API_ROUTES.auth.forgotPassword, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function getMobileSocialProviderAvailability() {
  return requestFromBackend<Record<SocialAuthProvider, boolean>>(API_ROUTES.auth.providers, {
    method: "GET",
  });
}

export async function signInWithSocialProvider(provider: SocialAuthProvider) {
  const redirectUri = Linking.createURL("/auth/callback");
  const startUrl = `${getApiBaseUrl()}${API_ROUTES.auth.socialStart(provider)}?redirect_uri=${encodeURIComponent(redirectUri)}`;
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

  return requestFromBackend<MobileAuthResult>(API_ROUTES.auth.socialComplete, {
    method: "POST",
    body: JSON.stringify({ handoffCode }),
  });
}
