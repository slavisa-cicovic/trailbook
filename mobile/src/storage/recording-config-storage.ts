import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { CachedMobileRecordingConfig } from "../domain/recording-config";
import { loadJsonRecord, saveJsonRecord } from "./sqlite/db";
import { migrateOnce } from "./sqlite/migrate-once";

async function ensureRecordingConfigMigrated(): Promise<void> {
  await migrateOnce("async-storage/recording-config", async () => {
    const existingRecord = await loadJsonRecord<CachedMobileRecordingConfig>(STORAGE_KEYS.recordingConfig);

    if (existingRecord) {
      return;
    }

    const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.recordingConfig);

    if (!rawValue) {
      return;
    }

    await saveJsonRecord(STORAGE_KEYS.recordingConfig, JSON.parse(rawValue) as CachedMobileRecordingConfig);
  });
}

export async function loadRecordingConfig(): Promise<CachedMobileRecordingConfig | null> {
  await ensureRecordingConfigMigrated();
  return loadJsonRecord<CachedMobileRecordingConfig>(STORAGE_KEYS.recordingConfig);
}

export async function saveRecordingConfig(record: CachedMobileRecordingConfig | null): Promise<void> {
  await ensureRecordingConfigMigrated();
  await saveJsonRecord(STORAGE_KEYS.recordingConfig, record);
}
