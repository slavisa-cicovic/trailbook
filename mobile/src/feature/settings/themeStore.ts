import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

const THEME_KEY = 'trailbook.theme_preference';

export type ThemePreference = 'auto' | 'day' | 'night';

interface ThemeState {
  preference: ThemePreference;
}

interface ThemeActions {
  init(): Promise<void>;
  setPreference(p: ThemePreference): Promise<void>;
}

export const useThemeStore = create<ThemeState & ThemeActions>((set) => ({
  preference: 'auto',

  async init() {
    const stored = await AsyncStorage.getItem(THEME_KEY);
    if (stored === 'day' || stored === 'night' || stored === 'auto') {
      set({ preference: stored });
    }
  },

  async setPreference(preference) {
    set({ preference });
    await AsyncStorage.setItem(THEME_KEY, preference);
  },
}));

export function useResolvedColorScheme(): 'light' | 'dark' {
  const preference = useThemeStore((s) => s.preference);
  const system = useColorScheme();
  if (preference === 'day') return 'light';
  if (preference === 'night') return 'dark';
  return system === 'dark' ? 'dark' : 'light';
}
