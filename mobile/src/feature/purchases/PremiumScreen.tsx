import { Redirect, useRouter } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import ScreenLayout from '@/components/layout/screen-layout';
import Card from '@/components/ui/card';
import LoadingButton from '@/components/ui/loading-button';
import {
  hasPremiumAccess,
  type PurchaseAccess,
  type PurchaseProduct,
} from '@/core/domain/model/purchase';
import { useAuthStore } from '@/feature/auth/authStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAppleIap } from './AppleIapProvider';
import { usePurchaseStore } from './purchaseStore';
import {
  APPLE_MANAGE_SUBSCRIPTIONS_URL,
  purchaseSupportUrl,
  TRAILBOOK_PRIVACY_POLICY_URL,
  TRAILBOOK_TERMS_OF_USE_URL,
} from '@/constants/legal';

export default function PremiumScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const status = useAuthStore((state) => state.status);
  const access = usePurchaseStore((state) => state.access);
  const busyAction = usePurchaseStore((state) => state.busyAction);
  const clearMessage = usePurchaseStore((state) => state.clearMessage);
  const message = usePurchaseStore((state) => state.message);
  const products = usePurchaseStore((state) => state.products);
  const iap = useAppleIap();
  const visibleMessage =
    message === 'Trailbook Premium is active.' && !hasPremiumAccess(access)
      ? null
      : message;

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

      {access ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title="Your subscription"
          titleStyle={{ color: theme.primaryText }}
          subtitle={subscriptionSummary(access)}
          subtitleStyle={{ color: theme.mutedText }}
        >
          <View style={styles.statusDetails}>
            <StatusRow label="Plan" value={planLabel(access.planCode)} />
            <StatusRow label="Status" value={statusLabel(access)} />
            {access.currentPeriodEndsAt ? (
              <StatusRow
                label={periodEndLabel(access.subscriptionStatus)}
                value={formatDate(access.currentPeriodEndsAt)}
              />
            ) : null}
          </View>
          {access.provider === 'apple' && access.planCode !== 'demo' ? (
            <LoadingButton
              onPress={() => void openUrl(APPLE_MANAGE_SUBSCRIPTIONS_URL)}
              variant="secondary"
            >
              Manage subscription
            </LoadingButton>
          ) : null}
        </Card>
      ) : null}

      {visibleMessage ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title="Purchase update"
          titleStyle={{ color: theme.primaryText }}
          subtitle={visibleMessage}
          subtitleStyle={{ color: theme.mutedText }}
        >
          <Pressable onPress={clearMessage} style={styles.dismissMessage}>
            <Text style={[styles.linkText, { color: theme.accent }]}>Dismiss</Text>
          </Pressable>
        </Card>
      ) : null}

      {iap.pendingProductIds.length > 0 ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title="Completing Apple purchase"
          titleStyle={{ color: theme.primaryText }}
          subtitle="Trailbook is verifying or finishing an Apple transaction and will retry automatically."
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

      <View style={styles.linkGroup}>
        <LegalLink label="Terms of Use" onPress={() => void openUrl(TRAILBOOK_TERMS_OF_USE_URL)} />
        <LegalLink label="Privacy Policy" onPress={() => void openUrl(TRAILBOOK_PRIVACY_POLICY_URL)} />
        <LegalLink label="Purchase support" onPress={() => void openUrl(purchaseSupportUrl())} />
      </View>
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
      <Text style={[styles.renewal, { color: theme.mutedText }]}>
        {introductoryRenewalText(product)}
      </Text>
      <LoadingButton
        disabled={!connected || busyAction !== null || pending}
        loading={
          busyAction === action || busyAction === `verify:${product.productId}`
        }
        loadingLabel="Processing…"
        onPress={onPurchase}
      >
        {pending ? 'Completion pending…' : `Choose ${product.billingType}`}
      </LoadingButton>
    </Card>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.statusRow}>
      <Text style={[styles.statusLabel, { color: theme.mutedText }]}>{label}</Text>
      <Text style={[styles.statusValue, { color: theme.primaryText }]}>{value}</Text>
    </View>
  );
}

function LegalLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useAppTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.legalLink}>
      <Text style={[styles.linkText, { color: theme.accent }]}>{label}</Text>
    </Pressable>
  );
}

function subscriptionSummary(access: PurchaseAccess) {
  if (access.planCode === 'demo') return 'No active Premium subscription.';
  if (access.subscriptionStatus === 'canceled') {
    return access.currentPeriodEndsAt
      ? `Canceled. Premium remains active until ${formatDate(access.currentPeriodEndsAt)}.`
      : 'Canceled. Premium remains active until the end of the current period.';
  }
  if (access.subscriptionStatus === 'active') return 'Trailbook Premium is active.';
  if (access.subscriptionStatus === 'in_grace_period') {
    return 'Premium remains active during the billing grace period.';
  }
  if (access.subscriptionStatus === 'billing_retry') {
    return 'Premium access is paused while Apple retries the subscription payment. Update your payment method to restore access.';
  }
  if (access.subscriptionStatus === 'revoked') return 'This subscription was revoked.';
  if (access.subscriptionStatus === 'expired') return 'This subscription has expired.';
  if (!hasPremiumAccess(access)) return 'No active Premium subscription.';
  return 'No active Premium subscription.';
}

function planLabel(planCode: string) {
  if (planCode === 'premium_monthly') return 'Premium Monthly';
  if (planCode === 'premium_yearly') return 'Premium Yearly';
  return 'No active plan';
}

function statusLabel(access: PurchaseAccess) {
  if (access.planCode === 'demo') return 'Not subscribed';
  const labels: Record<PurchaseAccess['subscriptionStatus'], string> = {
    active: 'Active',
    billing_retry: 'Billing retry',
    canceled: 'Canceled',
    expired: 'Expired',
    in_grace_period: 'Billing grace period',
    lifetime: 'Lifetime',
    revoked: 'Revoked',
  };
  return labels[access.subscriptionStatus];
}

function periodEndLabel(status: PurchaseAccess['subscriptionStatus']) {
  if (status === 'canceled') return 'Access ends';
  if (status === 'billing_retry' || status === 'expired' || status === 'revoked') {
    return 'Current period ended';
  }
  return 'Current period ends';
}

function introductoryRenewalText(product: PurchaseProduct) {
  const period = product.billingPeriodLabel ?? product.billingType;
  if (/free (?:for|trial)/i.test(product.description)) {
    return `After the free trial, the subscription renews automatically at ${product.priceLabel} per ${period} until canceled.`;
  }
  return `Renews automatically at ${product.priceLabel} per ${period} until canceled.`;
}

async function openUrl(url: string) {
  await Linking.openURL(url);
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
  statusDetails: { gap: 8 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  statusLabel: { fontSize: 13, fontWeight: '700' },
  statusValue: { flex: 1, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  priceRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4 },
  price: { fontSize: 29, fontWeight: '900' },
  period: { fontSize: 14, fontWeight: '700' },
  renewal: { fontSize: 12, lineHeight: 18 },
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
  dismissMessage: { alignSelf: 'flex-start', paddingVertical: 4 },
  linkGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 20 },
  legalLink: { paddingHorizontal: 6, paddingVertical: 6 },
  linkText: { fontSize: 13, fontWeight: '800' },
});
