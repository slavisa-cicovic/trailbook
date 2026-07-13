import { useEffect } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import ScreenLayout from '@/components/layout/screen-layout';
import Card from '@/components/ui/card';
import LoadingButton from '@/components/ui/loading-button';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import {
  hasPremiumAccess,
  type PurchaseProduct,
} from '@/core/domain/model/purchase';
import { useAuthStore } from '@/feature/auth/authStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAppleIap } from './AppleIapProvider';
import { usePurchaseStore } from './purchaseStore';

export default function PremiumScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const status = useAuthStore((state) => state.status);
  const access = usePurchaseStore((state) => state.access);
  const busyAction = usePurchaseStore((state) => state.busyAction);
  const clearMessage = usePurchaseStore((state) => state.clearMessage);
  const message = usePurchaseStore((state) => state.message);
  const products = usePurchaseStore((state) => state.products);
  const iap = useAppleIap();

  useEffect(() => {
    if (!message) return;
    showAlert({
      title: 'Trailbook Premium',
      message,
      buttons: [{ text: 'OK', onPress: clearMessage }],
    });
  }, [clearMessage, message, showAlert]);

  if (status === 'demo') return <Redirect href="/settings" />;

  return (
    <ScreenLayout
      contentStyle={styles.content}
      contentVariant="plain"
      onBack={() => router.back()}
      scrollEnabled
      title="Trailbook Premium"
    >
      <View style={[styles.hero, { backgroundColor: theme.accent }]}>
        <Text style={[styles.eyebrow, { color: theme.background }]}>
          FULL TRAIL ACCESS
        </Text>
        <Text style={[styles.heroTitle, { color: theme.background }]}>
          Keep every journey.
        </Text>
        <Text style={[styles.heroBody, { color: theme.background }]}>
          Record without limits, protect your trips with sync and restore, and
          share routes with friends.
        </Text>
      </View>

      {hasPremiumAccess(access) ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title="Premium active"
          titleStyle={{ color: theme.primaryText }}
          subtitle={`${access.planCode} · ${access.subscriptionStatus}`}
          subtitleStyle={{ color: theme.mutedText }}
        >
          <Text style={[styles.period, { color: theme.mutedText }]}>
            Current period ends: {formatDate(access.currentPeriodEndsAt)}
          </Text>
        </Card>
      ) : null}

      {iap.pendingProductIds.length > 0 ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title="Purchase verification pending"
          titleStyle={{ color: theme.primaryText }}
          subtitle="Apple completed the purchase. Trailbook will keep retrying backend verification and finish the transaction automatically."
          subtitleStyle={{ color: theme.mutedText }}
        />
      ) : null}

      {!iap.available ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title="Native iOS build required"
          titleStyle={{ color: theme.primaryText }}
          subtitle="Apple subscriptions are unavailable in Expo Go. Use the installed Trailbook iOS build."
          subtitleStyle={{ color: theme.mutedText }}
        />
      ) : null}

      {iap.available && !iap.connected ? (
        <Text style={[styles.storeStatus, { color: theme.mutedText }]}>
          Connecting to App Store…
        </Text>
      ) : null}

      {iap.connected && products.length === 0 ? (
        <Text style={[styles.storeStatus, { color: theme.mutedText }]}>
          Loading Apple subscription options…
        </Text>
      ) : null}

      {products.map((product) => (
        <ProductCard
          busyAction={busyAction}
          connected={iap.connected}
          key={product.productId}
          onPurchase={() => void iap.purchase(product.productId)}
          pending={iap.pendingProductIds.includes(product.productId)}
          product={product}
        />
      ))}

      <Card
        style={[
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
        title="Already subscribed?"
        titleStyle={{ color: theme.primaryText }}
        subtitle="Restore asks Apple for your current subscriptions and verifies them with Trailbook."
        subtitleStyle={{ color: theme.mutedText }}
      >
        <LoadingButton
          disabled={!iap.available || !iap.connected || busyAction !== null}
          loading={busyAction === 'restore'}
          loadingLabel="Restoring…"
          onPress={() => void iap.restore()}
          variant="secondary"
        >
          Restore purchases
        </LoadingButton>
      </Card>

      <Text style={[styles.legal, { color: theme.mutedText }]}>
        Subscriptions renew automatically unless canceled at least 24 hours
        before the end of the current period. Payment is charged to your Apple
        ID. Manage or cancel the subscription in your App Store account
        settings.
      </Text>
    </ScreenLayout>
  );
}

function ProductCard({
  busyAction,
  connected,
  onPurchase,
  pending,
  product,
}: {
  busyAction: string | null;
  connected: boolean;
  onPurchase: () => void;
  pending: boolean;
  product: PurchaseProduct;
}) {
  const { theme } = useAppTheme();
  const action = `purchase:${product.productId}`;
  return (
    <Card
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
      title={product.title}
      titleStyle={{ color: theme.primaryText }}
      subtitle={product.description}
      subtitleStyle={{ color: theme.mutedText }}
    >
      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: theme.primaryText }]}>
          {product.priceLabel}
        </Text>
        {product.billingPeriodLabel ? (
          <Text style={[styles.period, { color: theme.mutedText }]}>
            /{product.billingPeriodLabel}
          </Text>
        ) : null}
      </View>
      <LoadingButton
        disabled={!connected || busyAction !== null || pending}
        loading={
          busyAction === action || busyAction === `verify:${product.productId}`
        }
        loadingLabel="Processing…"
        onPress={onPurchase}
      >
        {pending ? 'Verification pending…' : `Choose ${product.billingType}`}
      </LoadingButton>
    </Card>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not available';
}

const styles = StyleSheet.create({
  content: { justifyContent: 'flex-start' },
  hero: { borderRadius: 28, gap: 10, marginBottom: 18, padding: 24 },
  eyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    opacity: 0.75,
  },
  heroTitle: { fontSize: 31, fontWeight: '900', lineHeight: 36 },
  heroBody: { fontSize: 15, fontWeight: '600', lineHeight: 22, opacity: 0.85 },
  card: { borderWidth: 1, marginBottom: 14 },
  priceRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4 },
  price: { fontSize: 29, fontWeight: '900' },
  period: { fontSize: 14, fontWeight: '700' },
  storeStatus: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  legal: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 6,
    paddingBottom: 16,
  },
});
