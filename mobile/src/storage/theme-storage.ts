import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { AppThemeMode } from "../constants/app-theme";
import { loadJsonRecord, saveJsonRecord } from "./sqlite/db";

function normalizeThemeMode(value: unknown): AppThemeMode {
  if (value === "night") {
    return "night";
  }

  if (value === "auto") {
    return "auto";
  }

  return "day";
}

async function ensureThemeModeMigrated(): Promise<void> {
  const existingMode = await loadJsonRecord<AppThemeMode>(STORAGE_KEYS.theme);

  if (existingMode) {
    return;
  }

  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.theme);

  if (!rawValue) {
    return;
  }

  await saveJsonRecord(STORAGE_KEYS.theme, normalizeThemeMode(JSON.parse(rawValue)));
}

export async function loadThemeMode(): Promise<AppThemeMode> {
  await ensureThemeModeMigrated();

  const themeMode = await loadJsonRecord<AppThemeMode>(STORAGE_KEYS.theme);

  if (!themeMode) {
    return "auto";
  }

  return normalizeThemeMode(themeMode);
}

export async function saveThemeMode(themeMode: AppThemeMode): Promise<void> {
  await ensureThemeModeMigrated();
  await saveJsonRecord(STORAGE_KEYS.theme, themeMode);
}
