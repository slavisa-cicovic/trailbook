import { useEffect } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Card from '@/components/ui/card';
import LoadingButton from '@/components/ui/loading-button';
import ScreenLayout from '@/components/layout/screen-layout';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useAuthStore } from '@/feature/auth/authStore';
import { usePurchaseStore } from './purchaseStore';
import type {
  FakePurchaseScenario,
  PurchaseBillingType,
  PurchaseProduct,
} from './purchase.types';

interface ScenarioAction {
  key: string;
  label: string;
  scenario: FakePurchaseScenario;
  product: PurchaseProduct | null;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export default function PurchasesSimulationScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const role = useAuthStore((state) => state.role);
  const access = usePurchaseStore((state) => state.access);
  const busyAction = usePurchaseStore((state) => state.busyAction);
  const message = usePurchaseStore((state) => state.message);
  const products = usePurchaseStore((state) => state.products);
  const load = usePurchaseStore((state) => state.load);
  const runScenario = usePurchaseStore((state) => state.runScenario);
  const clearMessage = usePurchaseStore((state) => state.clearMessage);
  const allowed =
    (role === 'admin' || role === 'test_user') &&
    (__DEV__ || process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES === 'true');

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  useEffect(() => {
    if (message) {
      Alert.alert('', message, [{ text: 'OK', onPress: clearMessage }]);
    }
  }, [clearMessage, message]);

  if (!allowed) return <Redirect href="/settings" />;

  const monthly = findProduct(products, 'monthly');
  const yearly = findProduct(products, 'yearly');
  const lifetime = findProduct(products, 'lifetime');
  const activeProduct =
    products.find((product) => product.planCode === access?.planCode) ?? monthly;
  const actions: ScenarioAction[] = [
    { key: 'buy-monthly', label: 'Buy monthly', product: monthly, scenario: 'success' },
    { key: 'buy-yearly', label: 'Buy yearly', product: yearly, scenario: 'success' },
    {
      key: 'buy-lifetime',
      label: 'Buy lifetime',
      product: lifetime,
      scenario: 'success',
      variant: 'secondary',
    },
    {
      key: 'renew',
      label: 'Renew current',
      product: activeProduct,
      scenario: 'renew',
      variant: 'secondary',
    },
    {
      key: 'cancel-subscription',
      label: 'Cancel subscription',
      product: activeProduct,
      scenario: 'subscription_canceled',
      variant: 'secondary',
    },
    { key: 'expire', label: 'Expire', product: activeProduct, scenario: 'expired', variant: 'ghost' },
    { key: 'refund', label: 'Refund', product: activeProduct, scenario: 'refund', variant: 'ghost' },
    { key: 'revoke', label: 'Revoke', product: activeProduct, scenario: 'revoke', variant: 'ghost' },
    { key: 'pending', label: 'Pending', product: monthly, scenario: 'pending', variant: 'ghost' },
    { key: 'decline', label: 'Decline', product: monthly, scenario: 'decline', variant: 'ghost' },
  ];

  return (
    <ScreenLayout
      contentStyle={styles.content}
      contentVariant="plain"
      onBack={() => router.back()}
      title="Purchases simulation"
    >
      <Card
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        subtitle="Development tooling. No Apple or Google billing service is invoked."
        subtitleStyle={{ color: theme.mutedText }}
        title="Fake purchase provider"
        titleStyle={{ color: theme.primaryText }}
      >
        <InfoRow label="Plan" value={access?.planCode ?? 'Not loaded'} />
        <InfoRow label="Status" value={access?.subscriptionStatus ?? 'Not loaded'} />
        <InfoRow label="Period end" value={formatDate(access?.currentPeriodEndsAt)} />
        <InfoRow label="Provider" value={access?.provider ?? 'None'} />
        <InfoRow label="Environment" value={access?.environment ?? 'None'} />
        <Text style={[styles.label, { color: theme.mutedText }]}>Entitlements</Text>
        <Text style={[styles.entitlements, { color: theme.primaryText }]}>
          {access?.entitlements.length ? access.entitlements.join(', ') : 'None'}
        </Text>
        <LoadingButton
          loading={busyAction === 'refresh'}
          loadingLabel="Refreshing..."
          onPress={() => void load()}
          variant="secondary"
        >
          Refresh access
        </LoadingButton>
      </Card>

      <Card
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        title="Products"
        titleStyle={{ color: theme.primaryText }}
      >
        {products.map((product) => (
          <View key={product.productId} style={[styles.product, { borderColor: theme.border }]}>
            <View style={styles.productBody}>
              <Text style={[styles.productTitle, { color: theme.primaryText }]}>
                {product.title}
              </Text>
              <Text style={[styles.productDescription, { color: theme.mutedText }]}>
                {product.priceLabel}
              </Text>
            </View>
            <Text style={[styles.productDescription, { color: theme.mutedText }]}>
              {product.billingType}
            </Text>
          </View>
        ))}
      </Card>

      <Card
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        title="Scenarios"
        titleStyle={{ color: theme.primaryText }}
      >
        <View style={styles.actions}>
          {actions.map((action) => (
            <LoadingButton
              disabled={!action.product || busyAction !== null}
              key={action.key}
              loading={busyAction === action.key}
              loadingLabel="Processing..."
              onPress={() => {
                if (action.product) {
                  void runScenario(action.key, action.product.productId, action.scenario);
                }
              }}
              variant={action.variant}
            >
              {action.label}
            </LoadingButton>
          ))}
        </View>
      </Card>
    </ScreenLayout>
  );
}

function findProduct(products: PurchaseProduct[], billingType: PurchaseBillingType) {
  return products.find((product) => product.billingType === billingType) ?? null;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'None';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { theme } = useAppTheme();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.label, { color: theme.mutedText }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.primaryText }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'flex-start',
  },
  card: {
    borderWidth: 1,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
  value: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  entitlements: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  product: {
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
  productBody: {
    flex: 1,
    gap: 2,
  },
  productTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  productDescription: {
    fontSize: 13,
  },
  actions: {
    gap: 10,
  },
});
