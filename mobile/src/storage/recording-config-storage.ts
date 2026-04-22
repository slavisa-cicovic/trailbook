import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { CachedMobileRecordingConfig } from "../domain/recording-config";

export async function loadRecordingConfig(): Promise<CachedMobileRecordingConfig | null> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.recordingConfig);

  if (!rawValue) {
    return null;
  }

  return JSON.parse(rawValue) as CachedMobileRecordingConfig;
}

export async function saveRecordingConfig(record: CachedMobileRecordingConfig | null): Promise<void> {
  if (!record) {
    await AsyncStorage.removeItem(STORAGE_KEYS.recordingConfig);
    return;
  }

  await AsyncStorage.setItem(STORAGE_KEYS.recordingConfig, JSON.stringify(record));
}
