import { useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { runMigrations } from '@/core/db/runMigrations';
import { useAuthStore } from '@/feature/auth/authStore';
import { useRecordingStore } from '@/feature/recording/recordingStore';
import { useThemeStore } from '@/feature/settings/themeStore';
import { getAppTheme, resolveAppThemeMode } from '@/constants/app-theme';
// Side-effect imports: register TaskManager tasks before any component mounts
import '@/core/data/location/locationTask';
import { registerSyncTask } from '@/core/data/sync/syncTask';

SplashScreen.preventAutoHideAsync();

function AuthGate({ ready }: { ready: boolean }) {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready || status === 'loading') return;

    const inLogin = segments[0] === 'login';

    if (status === 'unauthenticated' && !inLogin) {
      router.replace('/login');
    } else if ((status === 'authenticated' || status === 'demo') && inLogin) {
      router.replace('/recording');
    }
  }, [ready, status, segments]);

  useEffect(() => {
    if (ready && status !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [ready, status]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const initAuth = useAuthStore((s) => s.init);
  const initRecording = useRecordingStore((s) => s.init);
  const initTheme = useThemeStore((s) => s.init);

  const themeMode = useThemeStore((s) => s.preference);
  const systemColorScheme = useColorScheme();
  const resolvedMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedMode);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setBackgroundColorAsync(theme.background);
    NavigationBar.setButtonStyleAsync(resolvedMode === 'night' ? 'light' : 'dark');
  }, [theme.background, resolvedMode]);

  useEffect(() => {
    runMigrations()
      .then(() => Promise.all([initAuth(), initTheme()]))
      .then(() => initRecording())
      .then(() => registerSyncTask())
      .then(() => setReady(true))
      .catch((e) => console.error('Startup failed', e));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="auto" />
      <AuthGate ready={ready} />
    </GestureHandlerRootView>
  );
}
