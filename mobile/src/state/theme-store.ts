import { create } from "zustand";

import type { AppThemeMode } from "../constants/app-theme";
import { loadThemeMode, saveThemeMode } from "../storage/theme-storage";

interface ThemeState {
  hydrated: boolean;
  mode: AppThemeMode;
}

export const useThemeStore = create<ThemeState>(() => ({
  hydrated: false,
  mode: "auto",
}));

export async function hydrateThemeStore(): Promise<void> {
  const mode = await loadThemeMode();
  useThemeStore.setState({ hydrated: true, mode });
}

export async function setThemeMode(mode: AppThemeMode): Promise<void> {
  useThemeStore.setState({ mode });
  await saveThemeMode(mode);
}
