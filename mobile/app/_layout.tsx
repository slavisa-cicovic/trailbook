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
import { resolveAppThemeMode } from '@/constants/app-theme';
import { CustomAlertProvider } from '@/components/ui/custom-alert-dialog';
// Side-effect imports: register TaskManager tasks before any component mounts
import '@/core/data/location/locationTask';
import { unregisterSyncTask } from '@/core/data/sync/syncTask';
import { AppleIapProvider } from '@/feature/purchases/AppleIapProvider';

SplashScreen.preventAutoHideAsync();

function AuthGate({ ready }: { ready: boolean }) {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready || status === 'loading') return;

    const inLogin = segments[0] === 'login';
    const inAuthCallback = segments[0] === 'auth';

    if (status === 'unauthenticated' && !inLogin && !inAuthCallback) {
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

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    NavigationBar.setButtonStyleAsync(resolvedMode === 'night' ? 'light' : 'dark');
  }, [resolvedMode]);

  useEffect(() => {
    runMigrations()
      .then(() => Promise.all([initAuth(), initTheme()]))
      .then(() => unregisterSyncTask())
      .then(() => initRecording())
      .then(() => setReady(true))
      .catch((e) => console.error('Startup failed', e));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CustomAlertProvider>
        <AppleIapProvider>
          <StatusBar style="auto" />
          <AuthGate ready={ready} />
        </AppleIapProvider>
      </CustomAlertProvider>
    </GestureHandlerRootView>
  );
}
