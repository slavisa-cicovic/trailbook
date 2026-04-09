import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AuthenticatedDeviceSession } from "../domain/identity";
import { STORAGE_KEYS } from "../constants/storage-keys";

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

export async function loadSession(): Promise<AuthenticatedDeviceSession | null> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.session);

  if (!rawValue) {
    return null;
  }

  return normalizeSession(JSON.parse(rawValue) as AuthenticatedDeviceSession);
}

export async function saveSession(session: AuthenticatedDeviceSession | null): Promise<void> {
  if (!session) {
    await AsyncStorage.removeItem(STORAGE_KEYS.session);
    return;
  }

  await AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}
