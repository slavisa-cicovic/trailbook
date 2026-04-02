import { useSyncExternalStore } from "react";

import type { AppThemeMode } from "../constants/app-theme";
import { loadThemeMode, saveThemeMode } from "../storage/theme-storage";

interface ThemeState {
  hydrated: boolean;
  mode: AppThemeMode;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: ThemeState = {
  hydrated: false,
  mode: "auto",
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(updater: ThemeState | ((currentState: ThemeState) => ThemeState)) {
  state = typeof updater === "function" ? updater(state) : updater;
  emitChange();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useThemeStore<T>(selector: (snapshot: ThemeState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateThemeStore(): Promise<void> {
  const mode = await loadThemeMode();

  setState({
    hydrated: true,
    mode,
  });
}

export async function setThemeMode(mode: AppThemeMode): Promise<void> {
  setState((currentState) => ({
    ...currentState,
    mode,
  }));

  await saveThemeMode(mode);
}
