import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuthStore } from '@/feature/auth/authStore';

const DEBUG_EMAIL = 'scaichat@gmail.com';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const loginWithSocial = useAuthStore((s) => s.loginWithSocial);
  const loginAsDemo = useAuthStore((s) => s.loginAsDemo);

  async function onDebugLoginPress() {
    setLoading(true);
    const result = await loginWithSocial('DEBUG', `debug-login:${DEBUG_EMAIL}`);
    setLoading(false);
    if (!result.ok) Alert.alert('Login failed', result.error);
    // navigation handled by AuthGate in _layout.tsx
  }

  async function onDemoPress() {
    setLoading(true);
    await loginAsDemo();
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vellora</Text>
      <Text style={styles.subtitle}>Track every journey</Text>

      <View style={styles.buttons}>
        <Pressable
          style={[styles.button, styles.primaryButton, loading && styles.disabled]}
          onPress={onDebugLoginPress}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Sign in (debug)</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.button, styles.secondaryButton, loading && styles.disabled]}
          onPress={onDemoPress}
          disabled={loading}
        >
          <Text style={styles.secondaryButtonText}>Try demo</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>Google / Apple sign-in — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: { fontSize: 40, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 48 },
  buttons: { width: '100%', gap: 12 },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  primaryButton: { backgroundColor: '#1a1a1a' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: '#f0f0f0' },
  secondaryButtonText: { color: '#1a1a1a', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  hint: { marginTop: 24, fontSize: 12, color: '#aaa' },
});
