import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { AppThemeMode } from "../constants/app-theme";

function normalizeThemeMode(value: unknown): AppThemeMode {
  if (value === "night") {
    return "night";
  }

  if (value === "auto") {
    return "auto";
  }

  return "day";
}

export async function loadThemeMode(): Promise<AppThemeMode> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.theme);

  if (!rawValue) {
    return "auto";
  }

  return normalizeThemeMode(JSON.parse(rawValue));
}

export async function saveThemeMode(themeMode: AppThemeMode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(themeMode));
}
