import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/feature/auth/authStore';
import { useAppTheme } from '@/hooks/useAppTheme';

const DEFAULT_LOGIN_EMAIL = process.env.EXPO_PUBLIC_DEV_LOGIN_EMAIL?.trim() || 'scaichat@gmail.com';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(DEFAULT_LOGIN_EMAIL);
  const loginWithSocial = useAuthStore((s) => s.loginWithSocial);
  const loginAsDemo = useAuthStore((s) => s.loginAsDemo);
  const { theme } = useAppTheme();

  async function onLoginPress() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Sign in failed', 'Email is required.');
      return;
    }

    setLoading(true);
    try {
      const result = await loginWithSocial('DEBUG', `debug-login:${normalizedEmail}`);
      if (!result.ok) Alert.alert('Sign in failed', result.error);
    } catch (e) {
      Alert.alert('Sign in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onDemoPress() {
    setLoading(true);
    try {
      await loginAsDemo();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
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
          <View style={[styles.hero, { backgroundColor: theme.accent }]}>
            <Text style={[styles.heroLetter, { color: theme.background }]}>T</Text>
          </View>

          <Text style={[styles.appName, { color: theme.primaryText }]}>Trailbook</Text>
          <Text style={[styles.tagline, { color: theme.mutedText }]}>
            Sign in to sync your recorded trips.
          </Text>

          <View style={styles.form}>
            <Text style={[styles.label, { color: theme.mutedText }]}>Email</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              inputMode="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.mutedText}
              style={[
                styles.input,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  color: theme.primaryText,
                },
              ]}
              value={email}
            />
          </View>

          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, { backgroundColor: theme.accent }, loading && styles.disabled]}
              onPress={() => void onLoginPress()}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={theme.background} size="small" />
              ) : (
                <Text style={[styles.primaryButtonText, { color: theme.background }]}>Sign in</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.button, { backgroundColor: theme.accentMuted }, loading && styles.disabled]}
              onPress={() => void onDemoPress()}
              disabled={loading}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.primaryText }]}>Try demo</Text>
            </Pressable>
          </View>

          <Text
            style={[styles.hint, { color: theme.mutedText }]}
          >
            Sign in currently uses the local debug auth provider.
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
  hero: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroLetter: { fontSize: 48, fontWeight: '800' },
  appName: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  tagline: { fontSize: 15, marginBottom: 32, textAlign: 'center' },
  form: { width: '100%', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
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
