import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import type { AuthenticatedDeviceSession } from "../domain/identity";
import { STORAGE_KEYS } from "../constants/storage-keys";

const SESSION_TOKEN_KEY = "trailbook.mobile.session-token.v1";

type StoredSessionRecord = Omit<AuthenticatedDeviceSession, "sessionToken"> & {
  sessionToken?: string | null;
};

function normalizeSession(session: AuthenticatedDeviceSession): AuthenticatedDeviceSession {
  return {
    ...session,
    mode: session.mode ?? (session.userEmail === "demo" ? "demo" : "authenticated"),
    displayName: session.displayName ?? (session.userEmail === "demo" ? "Demo" : session.userEmail),
    providers: session.providers ?? (session.userEmail === "demo" ? ["local"] : []),
    role: session.role ?? "user",
    sessionToken: "sessionToken" in session ? session.sessionToken : null,
  };
}

async function loadSecureSessionToken() {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
}

async function saveSecureSessionToken(sessionToken: string | null) {
  if (!sessionToken) {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
    return;
  }

  await SecureStore.setItemAsync(SESSION_TOKEN_KEY, sessionToken);
}

export async function loadSession(): Promise<AuthenticatedDeviceSession | null> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.session);

  if (!rawValue) {
    return null;
  }

  const parsedSession = JSON.parse(rawValue) as StoredSessionRecord;
  const storedSessionToken = await loadSecureSessionToken();
  const migratedSessionToken = parsedSession.sessionToken ?? null;
  const sessionToken = storedSessionToken ?? migratedSessionToken;

  if (!storedSessionToken && migratedSessionToken) {
    await saveSecureSessionToken(migratedSessionToken);
    const { sessionToken: _sessionToken, ...sessionWithoutToken } = parsedSession;
    await AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(sessionWithoutToken));
  }

  return normalizeSession({
    ...parsedSession,
    sessionToken,
  } as AuthenticatedDeviceSession);
}

export async function saveSession(session: AuthenticatedDeviceSession | null): Promise<void> {
  if (!session) {
    await saveSecureSessionToken(null);
    await AsyncStorage.removeItem(STORAGE_KEYS.session);
    return;
  }

  const { sessionToken, ...sessionWithoutToken } = session;
  await saveSecureSessionToken(sessionToken);
  await AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(sessionWithoutToken));
}
