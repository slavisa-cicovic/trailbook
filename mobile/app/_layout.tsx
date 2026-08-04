import { useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  Stack,
  type ErrorBoundaryProps,
  useRouter,
  useSegments,
} from 'expo-router';
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
import { GoogleIapProvider } from '@/feature/purchases/GoogleIapProvider';

SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  console.error('Unhandled route error', error);

  return (
    <FailureScreen
      message="Trailbook encountered an unexpected error."
      onRetry={retry}
    />
  );
}

function FailureScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void | Promise<void>;
}) {
  return (
    <View style={styles.failureScreen}>
      <Text style={styles.failureTitle}>Something went wrong</Text>
      <Text style={styles.failureMessage}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void onRetry()}
        style={styles.retryButton}
      >
        <Text style={styles.retryButtonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

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
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [startupError, setStartupError] = useState<Error | null>(null);
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
    let canceled = false;
    setReady(false);
    setStartupError(null);

    runMigrations()
      .then(() => Promise.all([initAuth(), initTheme()]))
      .then(() => unregisterSyncTask())
      .then(() => initRecording())
      .then(() => {
        if (!canceled) setReady(true);
      })
      .catch((error) => {
        if (canceled) return;
        const startupFailure =
          error instanceof Error ? error : new Error(String(error));
        console.error('Startup failed', startupFailure);
        setStartupError(startupFailure);
        void SplashScreen.hideAsync();
      });

    return () => {
      canceled = true;
    };
  }, [initAuth, initRecording, initTheme, startupAttempt]);

  if (startupError) {
    return (
      <FailureScreen
        message="Trailbook could not finish starting. Check your connection and try again."
        onRetry={() => setStartupAttempt((attempt) => attempt + 1)}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CustomAlertProvider>
        <AppleIapProvider>
          <GoogleIapProvider>
            <StatusBar style="auto" />
            <AuthGate ready={ready} />
          </GoogleIapProvider>
        </AppleIapProvider>
      </CustomAlertProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  failureScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
    backgroundColor: '#f3efe6',
  },
  failureTitle: {
    color: '#243224',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  failureMessage: {
    color: '#5f6f5c',
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center',
  },
  retryButton: {
    minWidth: 180,
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#243224',
  },
  retryButtonText: {
    color: '#f7f4ed',
    fontSize: 16,
    fontWeight: '700',
  },
});
