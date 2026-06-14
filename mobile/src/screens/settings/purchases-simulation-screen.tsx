import { useCallback, useEffect, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { StyleSheet, Text, View, useColorScheme } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import Card from "../../components/ui/card";
import LoadingButton from "../../components/ui/loading-button";
import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import { useFeatureFlags } from "../../core/hooks/use-feature-flags";
import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
} from "../../domain/purchases";
import {
  getMobilePurchaseProvider,
  isFakePurchaseProviderEnabled,
} from "../../services/purchases/mobile-purchase-provider-resolver";
import { useSessionStore } from "../../state/session-store";
import { useThemeStore } from "../../state/theme-store";

type BusyAction =
  | "refresh"
  | "restore"
  | "buy-monthly"
  | "buy-yearly"
  | "buy-lifetime"
  | "renew"
  | "cancel"
  | "expire"
  | "refund"
  | "revoke"
  | "pending"
  | "decline"
  | null;

interface ScenarioAction {
  busyKey: Exclude<BusyAction, "refresh" | "restore" | null>;
  label: string;
  product: PurchaseProduct | null;
  scenario: FakePurchaseScenario;
  variant?: "primary" | "secondary" | "ghost";
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "None";
}

function formatAccessLine(access: PurchaseAccess | null) {
  if (!access) {
    return "Access not loaded.";
  }

  return `${access.planCode} / ${access.subscriptionStatus}`;
}

function productByBillingType(products: PurchaseProduct[], billingType: PurchaseProduct["billingType"]) {
  return products.find((product) => product.billingType === billingType) ?? null;
}

export default function PurchasesSimulationScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);
  const { testSettingsEnabled } = useFeatureFlags();
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const theme = getAppTheme(resolveAppThemeMode(themeMode, systemColorScheme));
  const [access, setAccess] = useState<PurchaseAccess | null>(null);
  const [products, setProducts] = useState<PurchaseProduct[]>([]);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fakeEnabled = isFakePurchaseProviderEnabled(identitySession);

  const loadPurchases = useCallback(async () => {
    if (!identitySession || identitySession.mode !== "authenticated") {
      return;
    }

    setBusyAction((current) => current ?? "refresh");
    setMessage(null);

    try {
      const provider = getMobilePurchaseProvider(identitySession);
      const [nextAccess, nextProducts] = await Promise.all([
        provider.refreshAccess(),
        provider.listProducts(),
      ]);

      setAccess(nextAccess);
      setProducts(nextProducts);
      setMessage("Purchase access refreshed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Purchase access refresh failed.");
    } finally {
      setBusyAction(null);
    }
  }, [identitySession]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadPurchases();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [loadPurchases]);

  async function handleScenario(action: ScenarioAction) {
    if (!action.product) {
      setMessage("Requested fake product is not available.");
      return;
    }

    setBusyAction(action.busyKey);
    setMessage(null);

    try {
      const provider = getMobilePurchaseProvider(identitySession);
      const result = await provider.purchase({
        productId: action.product.productId,
        scenario: action.scenario,
      });
      const nextAccess = await provider.refreshAccess();

      setAccess(nextAccess);
      setMessage(`Scenario ${action.scenario} finished: ${result.purchaseResult}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Purchase simulation failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRestore() {
    setBusyAction("restore");
    setMessage(null);

    try {
      const provider = getMobilePurchaseProvider(identitySession);
      const nextAccess = await provider.restorePurchases();

      setAccess(nextAccess);
      setMessage("Restore completed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setBusyAction(null);
    }
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (!testSettingsEnabled) {
    return <Redirect href="/settings" />;
  }

  const monthlyProduct = productByBillingType(products, "monthly");
  const yearlyProduct = productByBillingType(products, "yearly");
  const lifetimeProduct = productByBillingType(products, "lifetime");
  const activeSubscriptionProduct =
    products.find((product) => product.planCode === access?.planCode) ?? monthlyProduct;
  const scenarioActions: ScenarioAction[] = [
    { busyKey: "buy-monthly", label: "Buy monthly", product: monthlyProduct, scenario: "success" },
    { busyKey: "buy-yearly", label: "Buy yearly", product: yearlyProduct, scenario: "success" },
    {
      busyKey: "buy-lifetime",
      label: "Buy lifetime",
      product: lifetimeProduct,
      scenario: "success",
      variant: "secondary",
    },
    {
      busyKey: "renew",
      label: "Renew current",
      product: activeSubscriptionProduct,
      scenario: "renew",
      variant: "secondary",
    },
    {
      busyKey: "cancel",
      label: "Cancel subscription",
      product: activeSubscriptionProduct,
      scenario: "subscription_canceled",
      variant: "secondary",
    },
    {
      busyKey: "expire",
      label: "Expire",
      product: activeSubscriptionProduct,
      scenario: "expired",
      variant: "ghost",
    },
    {
      busyKey: "refund",
      label: "Refund",
      product: activeSubscriptionProduct,
      scenario: "refund",
      variant: "ghost",
    },
    {
      busyKey: "revoke",
      label: "Revoke",
      product: activeSubscriptionProduct,
      scenario: "revoke",
      variant: "ghost",
    },
    {
      busyKey: "pending",
      label: "Pending",
      product: monthlyProduct,
      scenario: "pending",
      variant: "ghost",
    },
    {
      busyKey: "decline",
      label: "Decline",
      product: monthlyProduct,
      scenario: "decline",
      variant: "ghost",
    },
  ];

  return (
    <ScreenLayout
      contentVariant="plain"
      onBack={() => router.back()}
      showBottomNavigation
      title="Purchases simulation"
    >
      <View style={styles.root}>
        <Card
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
          subtitle="Development tooling only. This screen does not invoke Apple StoreKit or Google Play Billing."
          subtitleStyle={{ color: theme.mutedText }}
          title="Local purchase provider"
          titleStyle={{ color: theme.primaryText }}
        >
          <View style={[styles.notice, { backgroundColor: theme.accentMuted }]}>
            <MaterialIcons color={theme.accent} name="warning-amber" size={18} />
            <Text style={[styles.noticeText, { color: theme.primaryText }]}>
              Backend remains authoritative. If server fake purchases are disabled, actions will fail safely.
            </Text>
          </View>
          <Text style={[styles.description, { color: theme.mutedText }]}>
            Provider: {fakeEnabled ? "fake simulation" : "read-only access refresh"}
          </Text>
        </Card>

        <Card
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
          title="Current access"
          titleStyle={{ color: theme.primaryText }}
        >
          <InfoRow label="Plan / status" value={formatAccessLine(access)} />
          <InfoRow label="Current period ends" value={formatDate(access?.currentPeriodEndsAt ?? null)} />
          <InfoRow label="Provider" value={access?.provider ?? "None"} />
          <InfoRow label="Environment" value={access?.environment ?? "None"} />
          <View style={styles.entitlements}>
            <Text style={[styles.infoLabel, { color: theme.mutedText }]}>Entitlements</Text>
            {access?.entitlements.length ? (
              <View style={styles.chips}>
                {access.entitlements.map((entitlement) => (
                  <Text
                    key={entitlement}
                    style={[
                      styles.chip,
                      { backgroundColor: theme.accentMuted, color: theme.accent },
                    ]}
                  >
                    {entitlement}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={[styles.infoValue, { color: theme.primaryText }]}>None</Text>
            )}
          </View>
          <View style={styles.buttonGrid}>
            <LoadingButton
              loading={busyAction === "refresh"}
              loadingLabel="Refreshing..."
              onPress={() => void loadPurchases()}
              variant="secondary"
            >
              Refresh access
            </LoadingButton>
            <LoadingButton
              loading={busyAction === "restore"}
              loadingLabel="Restoring..."
              onPress={() => void handleRestore()}
              variant="ghost"
            >
              Restore
            </LoadingButton>
          </View>
        </Card>

        <Card
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
          title="Fake products"
          titleStyle={{ color: theme.primaryText }}
        >
          {products.length ? (
            products.map((product) => (
              <View
                key={product.productId}
                style={[styles.productRow, { borderColor: theme.border }]}
              >
                <View style={styles.productText}>
                  <Text style={[styles.productTitle, { color: theme.primaryText }]}>
                    {product.title}
                  </Text>
                  <Text style={[styles.description, { color: theme.mutedText }]}>
                    {product.priceLabel} · {product.billingType}
                  </Text>
                </View>
                <Text style={[styles.productCode, { color: theme.mutedText }]}>
                  {product.planCode}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.description, { color: theme.mutedText }]}>
              No fake products available for this session.
            </Text>
          )}
        </Card>

        {fakeEnabled ? (
          <Card
            style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            title="Scenario actions"
            titleStyle={{ color: theme.primaryText }}
          >
            <View style={styles.buttonGrid}>
              {scenarioActions.map((action) => (
                <LoadingButton
                  disabled={!action.product}
                  key={action.busyKey}
                  loading={busyAction === action.busyKey}
                  loadingLabel="Processing..."
                  onPress={() => void handleScenario(action)}
                  variant={action.variant ?? "primary"}
                >
                  {action.label}
                </LoadingButton>
              ))}
            </View>
          </Card>
        ) : null}

        {message ? (
          <Text style={[styles.message, { color: theme.mutedText }]}>{message}</Text>
        ) : null}
      </View>
    </ScreenLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const theme = getAppTheme(resolveAppThemeMode(themeMode, systemColorScheme));

  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: theme.mutedText }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.primaryText }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  card: {
    borderWidth: 1,
  },
  notice: {
    alignItems: "flex-start",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    textAlign: "right",
  },
  entitlements: {
    gap: 8,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  productRow: {
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingTop: 12,
  },
  productText: {
    flex: 1,
    gap: 2,
  },
  productTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  productCode: {
    fontSize: 12,
    fontWeight: "800",
  },
  buttonGrid: {
    gap: 10,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
});
