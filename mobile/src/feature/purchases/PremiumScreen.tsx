import { useCallback } from 'react';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
import {
  APPLE_MONTHLY_PRODUCT_ID,
  APPLE_YEARLY_PRODUCT_ID,
  useAppleIap,
} from './AppleIapProvider';
import { usePurchaseStore } from './purchaseStore';
import { useGoogleIap } from './GoogleIapProvider';
import { APP_ENVIRONMENT } from '@/core/config/appEnvironment';
import { useI18n } from '@/i18n/i18nStore';
import {
  purchaseSupportUrl,
  TRAILBOOK_PRIVACY_POLICY_URL,
  TRAILBOOK_TERMS_OF_USE_URL,
} from '@/constants/legal';

export default function PremiumScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { locale, t } = useI18n();
  const status = useAuthStore((state) => state.status);
  const access = usePurchaseStore((state) => state.access);
  const busyAction = usePurchaseStore((state) => state.busyAction);
  const clearMessage = usePurchaseStore((state) => state.clearMessage);
  const message = usePurchaseStore((state) => state.message);
  const products = usePurchaseStore((state) => state.products);
  const refreshAccess = usePurchaseStore((state) => state.refreshAccess);
  const appleIap = useAppleIap();
  const googleIap = useGoogleIap();
  const iap = Platform.OS === 'android' ? googleIap : appleIap;
  const storeName = Platform.OS === 'android' ? 'Google Play' : 'Apple';
  const visibleMessage =
    message === 'Trailbook Premium is active.' && !hasPremiumAccess(access)
      ? null
      : message
        ? localizePurchaseMessage(message, t)
        : null;
  const goBack = () => router.dismissTo('/settings');

  useFocusEffect(
    useCallback(() => {
      if (status !== 'authenticated') return;
      void refreshAccess();
      const timer = setInterval(() => void refreshAccess(), 30_000);
      return () => clearInterval(timer);
    }, [refreshAccess, status]),
  );

  if (status === 'demo') return <Redirect href="/settings" />;

  return (
    <ScreenLayout
      contentStyle={styles.content}
      contentVariant="plain"
      onBack={goBack}
      scrollEnabled
      title={t('premium.title')}
    >
      <View style={[styles.hero, { backgroundColor: theme.accent }]}>
        <Text style={[styles.eyebrow, { color: theme.background }]}>
          {t('premium.eyebrow')}
        </Text>
        <Text style={[styles.heroTitle, { color: theme.background }]}>
          {t('premium.heroTitle')}
        </Text>
        <Text style={[styles.heroBody, { color: theme.background }]}>
          {t('premium.heroBody')}
        </Text>
      </View>

      {access ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title={t('premium.yourSubscription')}
          titleStyle={{ color: theme.primaryText }}
          subtitle={subscriptionSummary(access, t, locale)}
          subtitleStyle={{ color: theme.mutedText }}
        >
          <View style={styles.statusDetails}>
            <StatusRow label={t('premium.plan')} value={planLabel(access.planCode, t)} />
            <StatusRow label={t('premium.status')} value={statusLabel(access, t)} />
            {access.currentPeriodEndsAt ? (
              <StatusRow
                label={periodEndLabel(access.subscriptionStatus, t)}
                value={formatDate(access.currentPeriodEndsAt, locale, t)}
              />
            ) : null}
          </View>
          {(access.provider === 'apple' || access.provider === 'google') &&
          access.planCode !== 'demo' ? (
            <View style={styles.subscriptionActions}>
              <LoadingButton
                disabled={!iap.available || !iap.connected}
                loading={busyAction === 'manage-subscription'}
                loadingLabel={t('premium.openingStore', { store: storeName })}
                onPress={() => void iap.manageSubscriptions()}
                variant="secondary"
              >
                {t('premium.manage')}
              </LoadingButton>
              {access.provider === 'apple' && hasPremiumAccess(access) && appleProductId(access.planCode) ? (
                <LoadingButton
                  disabled={!iap.available || !iap.connected || busyAction !== null}
                  loading={busyAction === 'refund'}
                  loadingLabel={t('premium.openingApple')}
                  onPress={() => void iap.requestRefund(appleProductId(access.planCode)!)}
                  variant="ghost"
                >
                  {t('premium.requestRefund')}
                </LoadingButton>
              ) : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      {visibleMessage ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title={t('premium.purchaseUpdate')}
          titleStyle={{ color: theme.primaryText }}
          subtitle={visibleMessage}
          subtitleStyle={{ color: theme.mutedText }}
        >
          <Pressable onPress={clearMessage} style={styles.dismissMessage}>
            <Text style={[styles.linkText, { color: theme.accent }]}>{t('premium.dismiss')}</Text>
          </Pressable>
        </Card>
      ) : null}

      {iap.pendingProductIds.length > 0 ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title={t('premium.completing', { store: storeName })}
          titleStyle={{ color: theme.primaryText }}
          subtitle={t('premium.verifying', { store: storeName })}
          subtitleStyle={{ color: theme.mutedText }}
        />
      ) : null}

      {Platform.OS === 'ios' && !iap.available ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title={t('premium.nativeIosTitle')}
          titleStyle={{ color: theme.primaryText }}
          subtitle={t('premium.nativeIosBody')}
          subtitleStyle={{ color: theme.mutedText }}
        />
      ) : null}

      {Platform.OS === 'android' && !iap.available ? (
        <Card
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
          title={APP_ENVIRONMENT === 'local'
            ? t('premium.localUnavailableTitle')
            : t('premium.nativeAndroidTitle')}
          titleStyle={{ color: theme.primaryText }}
          subtitle={APP_ENVIRONMENT === 'local'
            ? t('premium.localUnavailableBody')
            : t('premium.nativeAndroidBody')}
          subtitleStyle={{ color: theme.mutedText }}
        />
      ) : null}

      {iap.available && !iap.connected ? (
        <Text style={[styles.storeStatus, { color: theme.mutedText }]}>
          {t('premium.connecting', { store: storeName })}
        </Text>
      ) : null}

      {iap.connected &&
      products.length === 0 &&
      (iap.productLoadState === 'idle' ||
        iap.productLoadState === 'loading') ? (
        <Text style={[styles.storeStatus, { color: theme.mutedText }]}>
          {t('premium.loadingOptions', { store: storeName })}
        </Text>
      ) : null}

      {iap.connected &&
      products.length === 0 &&
      (iap.productLoadState === 'loaded' ||
        iap.productLoadState === 'error') ? (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}
          title={t('premium.unavailable', { store: storeName })}
          titleStyle={{ color: theme.primaryText }}
          subtitle={
            iap.productLoadError
              ? t('premium.catalogError', { store: storeName })
              : t('premium.catalogMissing', { store: storeName })
          }
          subtitleStyle={{ color: theme.mutedText }}
        >
          <LoadingButton
            onPress={() => void iap.reloadProducts()}
            variant="secondary"
          >
            {t('premium.retry')}
          </LoadingButton>
        </Card>
      ) : null}

      {products.map((product) => (
        <ProductCard
          busyAction={busyAction}
          connected={iap.connected}
          key={`${product.productId}:${product.basePlanId ?? ''}`}
          onPurchase={() => void iap.purchase(product.productId, product.basePlanId)}
          pending={iap.pendingProductIds.includes(product.basePlanId ?? product.productId)}
          product={product}
        />
      ))}

      <Card
        style={[
          styles.card,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
        title={t('premium.alreadySubscribed')}
        titleStyle={{ color: theme.primaryText }}
        subtitle={t('premium.restoreBody')}
        subtitleStyle={{ color: theme.mutedText }}
      >
        <LoadingButton
          disabled={!iap.available || !iap.connected || busyAction !== null}
          loading={busyAction === 'restore'}
          loadingLabel={t('premium.restoring')}
          onPress={() => void iap.restore()}
          variant="secondary"
        >
          {t('premium.restorePurchases')}
        </LoadingButton>
      </Card>

      <Text style={[styles.legal, { color: theme.mutedText }]}>
        {t('premium.legal')}
      </Text>

      <View style={styles.linkGroup}>
        <LegalLink label={t('premium.terms')} onPress={() => void openUrl(TRAILBOOK_TERMS_OF_USE_URL)} />
        <LegalLink label={t('premium.privacy')} onPress={() => void openUrl(TRAILBOOK_PRIVACY_POLICY_URL)} />
        <LegalLink label={t('premium.support')} onPress={() => void openUrl(purchaseSupportUrl())} />
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
  const { t } = useI18n();
  const action = `purchase:${product.productId}:${product.basePlanId ?? ''}`;
  return (
    <Card
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border },
      ]}
      title={planLabel(product.planCode, t)}
      titleStyle={{ color: theme.primaryText }}
      subtitle={productDescription(product, t)}
      subtitleStyle={{ color: theme.mutedText }}
    >
      <View style={styles.priceRow}>
        <Text style={[styles.price, { color: theme.primaryText }]}>
          {product.priceLabel}
        </Text>
        {product.billingPeriodLabel ? (
          <Text style={[styles.period, { color: theme.mutedText }]}>
            /{billingPeriodLabel(product.billingType, t)}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.renewal, { color: theme.mutedText }]}>
        {introductoryRenewalText(product, t)}
      </Text>
      <LoadingButton
        disabled={!connected || busyAction !== null || pending}
        loading={
          busyAction === action || busyAction === `verify:${product.productId}`
        }
        loadingLabel={t('premium.processing')}
        onPress={onPurchase}
      >
        {pending
          ? t('premium.completionPending')
          : t('premium.choose', { type: billingTypeLabel(product.billingType, t) })}
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

type Translate = ReturnType<typeof useI18n>['t'];

function subscriptionSummary(access: PurchaseAccess, t: Translate, locale: string) {
  if (!hasPremiumAccess(access)) return t('premium.summary.none');
  if (access.subscriptionStatus === 'canceled') {
    return access.currentPeriodEndsAt
      ? t('premium.summary.canceledUntil', {
          date: formatDate(access.currentPeriodEndsAt, locale, t),
        })
      : t('premium.summary.canceledPeriod');
  }
  if (access.subscriptionStatus === 'active') return t('premium.summary.active');
  if (access.subscriptionStatus === 'in_grace_period') {
    return t('premium.summary.grace');
  }
  if (access.subscriptionStatus === 'billing_retry') {
    return t('premium.summary.retry');
  }
  if (access.subscriptionStatus === 'revoked') return t('premium.summary.revoked');
  if (access.subscriptionStatus === 'expired') return t('premium.summary.expired');
  return t('premium.summary.none');
}

function planLabel(planCode: string, t: Translate) {
  if (planCode === 'premium_monthly') return t('premium.plan.monthly');
  if (planCode === 'premium_yearly') return t('premium.plan.yearly');
  return t('premium.plan.none');
}

function appleProductId(planCode: string) {
  if (planCode === 'premium_monthly') return APPLE_MONTHLY_PRODUCT_ID;
  if (planCode === 'premium_yearly') return APPLE_YEARLY_PRODUCT_ID;
  return null;
}

function statusLabel(access: PurchaseAccess, t: Translate) {
  if (access.planCode === 'demo') return t('premium.status.notSubscribed');
  const labels: Record<PurchaseAccess['subscriptionStatus'], string> = {
    active: t('premium.status.active'),
    billing_retry: t('premium.status.retry'),
    canceled: t('premium.status.canceled'),
    expired: t('premium.status.expired'),
    in_grace_period: t('premium.status.grace'),
    lifetime: t('premium.status.lifetime'),
    revoked: t('premium.status.revoked'),
  };
  return labels[access.subscriptionStatus];
}

function periodEndLabel(status: PurchaseAccess['subscriptionStatus'], t: Translate) {
  if (status === 'canceled') return t('premium.period.accessEnds');
  if (status === 'billing_retry' || status === 'expired' || status === 'revoked') {
    return t('premium.period.ended');
  }
  return t('premium.period.ends');
}

function introductoryRenewalText(product: PurchaseProduct, t: Translate) {
  const period = billingPeriodLabel(product.billingType, t);
  if (/free (?:for|trial)/i.test(product.description)) {
    return t('premium.renewalTrial', { period, price: product.priceLabel });
  }
  return t('premium.renewal', { period, price: product.priceLabel });
}

function productDescription(product: PurchaseProduct, t: Translate) {
  const period = billingPeriodLabel(product.billingType, t);
  if (/free (?:for|trial)|days free/i.test(product.description)) {
    return t('premium.trialWeek', { period, price: product.priceLabel });
  }
  return product.billingType === 'yearly'
    ? t('premium.productDescription.yearly')
    : t('premium.productDescription.monthly');
}

function billingPeriodLabel(type: PurchaseProduct['billingType'], t: Translate) {
  if (type === 'monthly') return t('premium.period.month');
  if (type === 'yearly') return t('premium.period.year');
  return t('premium.status.lifetime');
}

function billingTypeLabel(type: PurchaseProduct['billingType'], t: Translate) {
  if (type === 'monthly') return t('premium.plan.monthly');
  if (type === 'yearly') return t('premium.plan.yearly');
  return t('premium.status.lifetime');
}

function localizePurchaseMessage(message: string, t: Translate) {
  if (/pending/i.test(message)) return t('premium.message.pending');
  if (/linked to another|another Trailbook account|ownership/i.test(message)) {
    return t('premium.message.ownership');
  }
  if (/no active .*subscription|no purchases? (?:were )?found/i.test(message)) {
    return t('premium.message.restoreNone');
  }
  if (/sign in/i.test(message)) return t('premium.message.signIn');
  if (/not supported|unsupported product/i.test(message)) {
    return t('premium.message.unsupported');
  }
  if (/verified.*not.*active|not currently active/i.test(message)) {
    return t('premium.message.inactive');
  }
  if (/refreshed/i.test(message)) return t('premium.message.refreshed');
  if (/Premium is active/i.test(message)) return t('premium.message.active');
  return t('premium.message.failed');
}

async function openUrl(url: string) {
  await Linking.openURL(url);
}

function formatDate(value: string | null, locale: string, t: Translate) {
  return value ? new Date(value).toLocaleDateString(locale) : t('premium.notAvailable');
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
  subscriptionActions: { gap: 10 },
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
