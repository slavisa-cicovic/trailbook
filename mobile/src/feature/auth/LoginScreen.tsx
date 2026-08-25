import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '@/feature/auth/authStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import { API_BASE_URL } from '@/core/data/remote/apiConfig';
import { APP_ENVIRONMENT, OAUTH_SCHEME } from '@/core/config/appEnvironment';

const DEFAULT_LOGIN_EMAIL = process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL?.trim() || 'scaichat@gmail.com';
const OAUTH_RETURN_TO = `${OAUTH_SCHEME}:///auth/callback`;
const PROVIDERS = [
  { label: 'Continue with Google', provider: 'google' },
  { label: 'Continue with Apple', provider: 'apple' },
] as const;

const isExpoGo = Constants.appOwnership === 'expo';
const isDebugLoginEnabled =
  APP_ENVIRONMENT === 'local' ||
  isExpoGo ||
  process.env.EXPO_PUBLIC_DEV_LOGIN_ENABLED === 'true';
const isSocialLoginEnabled = APP_ENVIRONMENT !== 'local';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [email] = useState(DEFAULT_LOGIN_EMAIL);
  const router = useRouter();
  const loginWithSocial = useAuthStore((s) => s.loginWithSocial);
  const loginAsDemo = useAuthStore((s) => s.loginAsDemo);
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();

  async function onOAuthPress(provider: (typeof PROVIDERS)[number]['provider']) {
    setLoading(true);
    try {
      const url = `${API_BASE_URL}/auth/${provider}?returnTo=${encodeURIComponent(OAUTH_RETURN_TO)}`;
      const result = await WebBrowser.openAuthSessionAsync(url, OAUTH_RETURN_TO);
      if (result.type !== 'success') return;

      const callbackUrl = new URL(result.url);
      if (callbackUrl.protocol !== `${OAUTH_SCHEME}:` || callbackUrl.pathname !== '/auth/callback') {
        throw new Error('OAuth returned an unexpected callback URL.');
      }

      router.replace({
        pathname: '/auth/callback',
        params: Object.fromEntries(callbackUrl.searchParams.entries()),
      });
    } catch (e) {
      showAlert({
        title: 'Sign in failed',
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }

  async function onLoginPress() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      showAlert({ title: 'Sign in failed', message: 'Email is required.' });
      return;
    }

    setLoading(true);
    try {
      const result = await loginWithSocial('DEBUG', `debug-login:${normalizedEmail}`);
      if (!result.ok) showAlert({ title: 'Sign in failed', message: result.error });
    } catch (e) {
      showAlert({
        title: 'Sign in failed',
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }

  async function onDemoPress() {
    setLoading(true);
    try {
      await loginAsDemo();
    } catch (e) {
      showAlert({ title: 'Error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.container}>
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../../../assets/login-screen.png')}
            style={styles.logo}
          />
          <Text style={[styles.tagline, { color: theme.mutedText }]}>
            Sign in to sync your recorded trips.
          </Text>

          <View style={styles.buttons}>
            {isSocialLoginEnabled ? PROVIDERS.map((provider) => (
              <Pressable
                key={provider.provider}
                style={[styles.button, { backgroundColor: theme.accent }, loading && styles.disabled]}
                onPress={() => void onOAuthPress(provider.provider)}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.background} size="small" />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: theme.background }]}>
                    {provider.label}
                  </Text>
                )}
              </Pressable>
            )) : null}

            {isDebugLoginEnabled ? (
              <Pressable
                style={[styles.button, { backgroundColor: theme.accentMuted }, loading && styles.disabled]}
                onPress={() => void onLoginPress()}
                disabled={loading}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.primaryText }]}>Local sign in</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.button, { backgroundColor: theme.accentMuted }, loading && styles.disabled]}
              onPress={() => void onDemoPress()}
              disabled={loading}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.primaryText }]}>Try demo</Text>
            </Pressable>
          </View>

          <Text style={[styles.hint, { color: theme.mutedText }]}>
            {APP_ENVIRONMENT === 'local'
              ? 'Local sign in uses the configured development account.'
              : isExpoGo
              ? 'Expo Go uses debug sign in because OAuth deep links return to the native app.'
              : 'Sign in securely without leaving Trailbook.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  keyboard: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    width: 220,
    height: 220,
    resizeMode: 'contain',
    marginBottom: 16,
  },
  tagline: { fontSize: 15, marginBottom: 32, textAlign: 'center' },
  buttons: { width: '100%', gap: 12 },
  button: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700' },
  secondaryButtonText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  hint: { marginTop: 24, fontSize: 12, textAlign: 'center' },
});
