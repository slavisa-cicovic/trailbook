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
import { useI18nStore } from '@/i18n/i18nStore';
import { resolveAppThemeMode } from '@/constants/app-theme';
import { CustomAlertProvider } from '@/components/ui/custom-alert-dialog';
// Side-effect imports: register TaskManager tasks before any component mounts
import '@/core/data/location/locationTask';
import { unregisterSyncTask } from '@/core/data/sync/syncTask';
import { AppleIapProvider } from '@/feature/purchases/AppleIapProvider';
import { GoogleIapProvider } from '@/feature/purchases/GoogleIapProvider';
import { PurchaseAccessLifecycle } from '@/feature/purchases/PurchaseAccessLifecycle';
import {
  clearStartupFailure,
  describeStartupFailure,
  runStartupPhase,
  saveStartupFailure,
  startupFailureMessage,
  type StartupFailure,
} from '@/core/startup/startupDiagnostics';

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
  diagnostic,
  message,
  onRetry,
}: {
  diagnostic?: StartupFailure;
  message: string;
  onRetry: () => void | Promise<void>;
}) {
  return (
    <View style={styles.failureScreen}>
      <Text style={styles.failureTitle}>Something went wrong</Text>
      <Text style={styles.failureMessage}>{message}</Text>
      {diagnostic ? (
        <Text selectable style={styles.failureDiagnostic}>
          Diagnostic code: {diagnostic.code}{'\n'}
          Attempt: {diagnostic.attempt}{'\n'}
          Time: {diagnostic.occurredAt}
        </Text>
      ) : null}
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
  const [startupFailure, setStartupFailure] = useState<StartupFailure | null>(null);
  const initAuth = useAuthStore((s) => s.init);
  const initRecording = useRecordingStore((s) => s.init);
  const initTheme = useThemeStore((s) => s.init);
  const initI18n = useI18nStore((s) => s.init);

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
    setStartupFailure(null);

    async function initialize() {
      const attempt = startupAttempt + 1;
      try {
        await runStartupPhase('database', runMigrations);
        await runStartupPhase('authentication', initAuth);
        await runStartupPhase('preferences', async () => Promise.all([initTheme(), initI18n()]));
        await runStartupPhase('background_tasks', unregisterSyncTask);
        await runStartupPhase('recording_recovery', initRecording);
        await clearStartupFailure();
        if (!canceled) setReady(true);
      } catch (error) {
        if (canceled) return;
        const failure = describeStartupFailure(error, attempt);
        console.error(`[Trailbook][startup][${failure.code}]`, error);
        await saveStartupFailure(failure);
        if (canceled) return;
        setStartupFailure(failure);
        void SplashScreen.hideAsync();
      }
    }

    void initialize();

    return () => {
      canceled = true;
    };
  }, [initAuth, initI18n, initRecording, initTheme, startupAttempt]);

  if (startupFailure) {
    return (
      <FailureScreen
        diagnostic={startupFailure}
        message={startupFailureMessage(startupFailure)}
        onRetry={() => setStartupAttempt((attempt) => attempt + 1)}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <CustomAlertProvider>
        <AppleIapProvider>
          <GoogleIapProvider>
            <PurchaseAccessLifecycle />
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
  failureDiagnostic: {
    color: '#5f6f5c',
    fontSize: 13,
    lineHeight: 19,
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
