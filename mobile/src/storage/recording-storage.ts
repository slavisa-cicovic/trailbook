import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import { normalizeRecordingSession } from "../domain/normalize-recording-session";
import type { RecordingSessionSummary } from "../domain/trips";
import { loadJsonRecord, saveJsonRecord } from "./app-kv-storage";
import { migrateOnce } from "./sqlite/migrate-once";

async function ensureRecordingSessionMigrated(): Promise<void> {
  await migrateOnce("async-storage/recording-session", async () => {
    const existingRecord = await loadJsonRecord<RecordingSessionSummary>(STORAGE_KEYS.recording);

    if (existingRecord) {
      return;
    }

    const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.recording);

    if (!rawValue) {
      return;
    }

    await saveJsonRecord(STORAGE_KEYS.recording, normalizeRecordingSession(JSON.parse(rawValue) as RecordingSessionSummary));
  });
}

export async function loadRecordingSession(): Promise<RecordingSessionSummary | null> {
  await ensureRecordingSessionMigrated();

  const record = await loadJsonRecord<RecordingSessionSummary>(STORAGE_KEYS.recording);
  return record ? normalizeRecordingSession(record) : null;
}

export async function saveRecordingSession(recordingSession: RecordingSessionSummary): Promise<void> {
  await ensureRecordingSessionMigrated();
  await saveJsonRecord(STORAGE_KEYS.recording, recordingSession);
}
