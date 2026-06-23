import { useColorScheme } from 'react-native';
import { useThemeStore } from '@/feature/settings/themeStore';
import {
  getAppTheme,
  resolveAppThemeMode,
  type AppThemePalette,
  type ResolvedAppThemeMode,
} from '@/constants/app-theme';

export interface AppTheme {
  theme: AppThemePalette;
  resolvedMode: ResolvedAppThemeMode;
}

export function useAppTheme(): AppTheme {
  const themeMode = useThemeStore((s) => s.preference);
  const systemColorScheme = useColorScheme();
  const resolvedMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedMode);
  return { theme, resolvedMode };
}
