import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import type { AuthenticatedDeviceSession } from "../domain/identity";
import { STORAGE_KEYS } from "../constants/storage-keys";

const SESSION_TOKEN_KEY = "trailbook.mobile.session-token.v1";
const REFRESH_TOKEN_KEY = "trailbook.mobile.refresh-token.v1";

type StoredSessionRecord = Omit<AuthenticatedDeviceSession, "sessionToken" | "refreshToken"> & {
  sessionToken?: string | null;
  refreshToken?: string | null;
};

function normalizeSession(session: AuthenticatedDeviceSession): AuthenticatedDeviceSession {
  return {
    ...session,
    mode: session.mode ?? (session.userEmail === "demo" ? "demo" : "authenticated"),
    displayName: session.displayName ?? (session.userEmail === "demo" ? "Demo" : session.userEmail),
    providers: session.providers ?? (session.userEmail === "demo" ? ["local"] : []),
    role: session.role ?? "user",
    sessionToken: "sessionToken" in session ? session.sessionToken : null,
    sessionExpiresAt: "sessionExpiresAt" in session ? session.sessionExpiresAt : null,
    refreshToken: "refreshToken" in session ? session.refreshToken : null,
    refreshExpiresAt: "refreshExpiresAt" in session ? session.refreshExpiresAt : null,
  };
}

async function loadSecureSessionToken() {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

async function loadSecureRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

async function saveSecureSessionToken(sessionToken: string | null) {
  if (!sessionToken) {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    return;
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, sessionToken);
}

async function saveSecureRefreshToken(refreshToken: string | null) {
  if (!refreshToken) {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    return;
  }

  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function loadSession(): Promise<AuthenticatedDeviceSession | null> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.session);

  if (!rawValue) {
    return null;
  }

  const parsedSession = JSON.parse(rawValue) as StoredSessionRecord;
  const storedSessionToken = await loadSecureSessionToken();
  const storedRefreshToken = await loadSecureRefreshToken();
  const migratedSessionToken = parsedSession.sessionToken ?? null;
  const migratedRefreshToken = parsedSession.refreshToken ?? null;
  const sessionToken = storedSessionToken ?? migratedSessionToken;
  const refreshToken = storedRefreshToken ?? migratedRefreshToken;

  if ((!storedSessionToken && migratedSessionToken) || (!storedRefreshToken && migratedRefreshToken)) {
    await saveSecureSessionToken(migratedSessionToken);
    await saveSecureRefreshToken(migratedRefreshToken);
    const { sessionToken: _sessionToken, refreshToken: _refreshToken, ...sessionWithoutToken } = parsedSession;
    await AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(sessionWithoutToken));
  }

  return normalizeSession({
    ...parsedSession,
    sessionToken,
    refreshToken,
  } as AuthenticatedDeviceSession);
}

export async function saveSession(session: AuthenticatedDeviceSession | null): Promise<void> {
  if (!session) {
    await saveSecureSessionToken(null);
    await saveSecureRefreshToken(null);
    await AsyncStorage.removeItem(STORAGE_KEYS.session);
    return;
  }

  const { sessionToken, refreshToken, ...sessionWithoutToken } = session;
  await saveSecureSessionToken(sessionToken);
  await saveSecureRefreshToken(refreshToken);
  await AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(sessionWithoutToken));
}
