import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AuthenticatedDeviceSession } from "../domain/identity";
import { STORAGE_KEYS } from "../constants/storage-keys";

export async function loadSession(): Promise<AuthenticatedDeviceSession | null> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.session);

  if (!rawValue) {
    return null;
  }

  return JSON.parse(rawValue) as AuthenticatedDeviceSession;
}

export async function saveSession(session: AuthenticatedDeviceSession | null): Promise<void> {
  if (!session) {
    await AsyncStorage.removeItem(STORAGE_KEYS.session);
    return;
  }

  await AsyncStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}
