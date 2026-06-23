import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/feature/auth/authStore';
import { useAppTheme } from '@/hooks/useAppTheme';

const DEBUG_EMAIL = 'scaichat@gmail.com';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const loginWithSocial = useAuthStore((s) => s.loginWithSocial);
  const loginAsDemo = useAuthStore((s) => s.loginAsDemo);
  const { theme } = useAppTheme();

  async function onLoginPress() {
    setLoading(true);
    try {
      const result = await loginWithSocial('DEBUG', `debug-login:${DEBUG_EMAIL}`);
      if (!result.ok) Alert.alert('Login failed', result.error);
    } catch (e) {
      Alert.alert('Login failed', e instanceof Error ? e.message : String(e));
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
      <View style={styles.container}>
        <View style={[styles.hero, { backgroundColor: theme.accent }]}>
          <Text style={[styles.heroLetter, { color: theme.background }]}>V</Text>
        </View>

        <Text style={[styles.appName, { color: theme.primaryText }]}>Vellora</Text>
        <Text style={[styles.tagline, { color: theme.mutedText }]}>Track every journey</Text>

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

        <Text style={[styles.hint, { color: theme.mutedText }]}>Google / Apple sign-in — coming soon</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  tagline: { fontSize: 15, marginBottom: 40 },
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
