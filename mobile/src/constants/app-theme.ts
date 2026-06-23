export type AppThemeMode = 'auto' | 'day' | 'night';
export type ResolvedAppThemeMode = 'day' | 'night';

export interface AppThemePalette {
  accent: string;
  accentMuted: string;
  background: string;
  border: string;
  card: string;
  danger: string;
  dangerMuted: string;
  mutedText: string;
  navActiveBackground: string;
  navText: string;
  primaryText: string;
  surface: string;
}

const dayTheme: AppThemePalette = {
  accent: '#243224',
  accentMuted: '#e4ebe0',
  background: '#f3efe6',
  border: '#dde6d8',
  card: '#fffdf8',
  danger: '#9f3f31',
  dangerMuted: '#f7e0db',
  mutedText: '#52624f',
  navActiveBackground: '#243224',
  navText: '#5f6f5a',
  primaryText: '#1f2a1f',
  surface: '#f7f4ed',
};

const nightTheme: AppThemePalette = {
  accent: '#dce9d8',
  accentMuted: '#243127',
  background: '#121814',
  border: '#2f3a31',
  card: '#1a221c',
  danger: '#ffb4a6',
  dangerMuted: '#5e2e27',
  mutedText: '#9eb09b',
  navActiveBackground: '#dce9d8',
  navText: '#9eb09b',
  primaryText: '#f1f6ee',
  surface: '#16201a',
};

export function resolveAppThemeMode(
  mode: AppThemeMode,
  systemColorScheme: 'dark' | 'light' | null | undefined,
): ResolvedAppThemeMode {
  if (mode === 'auto') {
    return systemColorScheme === 'dark' ? 'night' : 'day';
  }
  return mode;
}

export function getAppTheme(mode: ResolvedAppThemeMode): AppThemePalette {
  return mode === 'night' ? nightTheme : dayTheme;
}
