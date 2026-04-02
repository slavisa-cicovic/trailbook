import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { RecordingSessionSummary } from "../domain/trips";

export async function loadRecordingSession(): Promise<RecordingSessionSummary | null> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.recording);

  if (!rawValue) {
    return null;
  }

  return JSON.parse(rawValue) as RecordingSessionSummary;
}

export async function saveRecordingSession(
  recordingSession: RecordingSessionSummary,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.recording, JSON.stringify(recordingSession));
}
