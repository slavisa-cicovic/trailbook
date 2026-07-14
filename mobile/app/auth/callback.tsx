import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/feature/auth/authStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import { purchaseRepository } from '@/core/data/repository/PurchaseRepositoryImpl';
import { hasPremiumAccess } from '@/core/domain/model/purchase';
import { usePurchaseStore } from '@/feature/purchases/purchaseStore';

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const loginWithOAuthSession = useAuthStore((s) => s.loginWithOAuthSession);
  const setPurchaseAccess = usePurchaseStore((s) => s.setAccess);
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    const accessToken = getParam(params.accessToken);
    const refreshToken = getParam(params.refreshToken);
    const userId = getParam(params.userId);
    const email = getParam(params.email);
    const displayName = getParam(params.displayName);
    const role = getParam(params.role);

    if (!accessToken || !refreshToken || !userId || !email || !displayName || !role) {
      showAlert({ title: 'Sign in failed', message: 'OAuth callback is incomplete.' });
      router.replace('/login');
      return;
    }

    loginWithOAuthSession({
      accessToken,
      refreshToken,
      user: { id: userId, email, displayName, role },
    }).then(async (result) => {
      if (!result.ok) {
        showAlert({ title: 'Sign in failed', message: result.error });
        router.replace('/login');
        return;
      }

      const [access, testTrip] = await Promise.all([
        purchaseRepository.getCurrentAccess(),
        purchaseRepository.getLocalTestTripAllowance(),
      ]);
      if (access.ok) setPurchaseAccess(access.value, userId);
      router.replace(
        access.ok && !hasPremiumAccess(access.value) && testTrip.ok && !testTrip.value.available
          ? '/premium'
          : '/recording',
      );
    });
  }, [loginWithOAuthSession, params, router, setPurchaseAccess, showAlert]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text style={[styles.text, { color: theme.mutedText }]}>Completing sign in...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  text: { fontSize: 15, fontWeight: '600' },
});
