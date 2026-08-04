import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import type { ProductSubscriptionAndroid, Purchase } from 'expo-iap';

import { purchaseRepository } from '@/core/data/repository/PurchaseRepositoryImpl';
import type {
  PurchaseBillingType,
  PurchaseProduct,
} from '@/core/domain/model/purchase';
import { hasPremiumAccess } from '@/core/domain/model/purchase';
import { useAuthStore } from '@/feature/auth/authStore';
import { usePurchaseStore } from './purchaseStore';

export const GOOGLE_PREMIUM_PRODUCT_ID = 'trailbook_premium';
export const GOOGLE_MONTHLY_BASE_PLAN_ID = 'monthly';
export const GOOGLE_YEARLY_BASE_PLAN_ID = 'yearly';
const GOOGLE_BASE_PLAN_IDS = [
  GOOGLE_MONTHLY_BASE_PLAN_ID,
  GOOGLE_YEARLY_BASE_PLAN_ID,
];
const ANDROID_PACKAGE_NAME = 'com.slavisacicovic.trailbook';

interface GoogleIapContextValue {
  available: boolean;
  connected: boolean;
  pendingProductIds: string[];
  productLoadError: string | null;
  productLoadState: 'idle' | 'loading' | 'loaded' | 'error';
  manageSubscriptions(): Promise<void>;
  purchase(productId: string, basePlanId?: string): Promise<void>;
  reloadProducts(): Promise<void>;
  requestRefund(productId: string): Promise<void>;
  restore(): Promise<void>;
}

const unavailableGoogleIap: GoogleIapContextValue = {
  available: false,
  connected: false,
  pendingProductIds: [],
  productLoadError: null,
  productLoadState: 'idle',
  async manageSubscriptions() {},
  async purchase() {},
  async reloadProducts() {},
  async requestRefund() {},
  async restore() {},
};

const GoogleIapContext = createContext(unavailableGoogleIap);

export function GoogleIapProvider({ children }: PropsWithChildren) {
  const available =
    Platform.OS === 'android' &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  return available ? (
    <NativeGoogleIapProvider>{children}</NativeGoogleIapProvider>
  ) : (
    <GoogleIapContext.Provider value={unavailableGoogleIap}>
      {children}
    </GoogleIapContext.Provider>
  );
}

export function useGoogleIap() {
  return useContext(GoogleIapContext);
}

function NativeGoogleIapProvider({ children }: PropsWithChildren) {
  const {
    deepLinkToSubscriptions,
    getAvailablePurchases,
    useIAP,
  } = require('expo-iap') as typeof import('expo-iap');
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.userId);
  const hydrateAccess = usePurchaseStore((state) => state.hydrateAccess);
  const refreshAccess = usePurchaseStore((state) => state.refreshAccess);
  const setAccess = usePurchaseStore((state) => state.setAccess);
  const setBusyAction = usePurchaseStore((state) => state.setBusyAction);
  const setMessage = usePurchaseStore((state) => state.setMessage);
  const setProducts = usePurchaseStore((state) => state.setProducts);
  const [pendingBasePlanIds, setPendingBasePlanIds] = useState<string[]>([]);
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [productLoadState, setProductLoadState] =
    useState<GoogleIapContextValue['productLoadState']>('idle');
  const initiatedBasePlanId = useRef<string | null>(null);
  const processingTokens = useRef(new Set<string>());
  const processPurchaseRef = useRef<(purchase: Purchase, notify?: boolean) => Promise<void>>(
    async () => {},
  );

  const iap = useIAP({
    onError(error) {
      console.warn('[Trailbook][google-iap]', errorMessage(error));
    },
    onPurchaseError(error) {
      initiatedBasePlanId.current = null;
      setBusyAction(null);
      setMessage(googlePurchaseErrorMessage(error));
    },
    onPurchaseSuccess(purchase) {
      void processPurchaseRef.current(purchase, true);
    },
  });

  async function processPurchase(purchase: Purchase, notify = false) {
    if (purchase.store !== 'google' || purchase.productId !== GOOGLE_PREMIUM_PRODUCT_ID) return;
    const purchaseToken = purchase.purchaseToken;
    const basePlanId = purchase.currentPlanId ?? initiatedBasePlanId.current;
    if (!purchaseToken || !basePlanId || !GOOGLE_BASE_PLAN_IDS.includes(basePlanId)) {
      if (notify) setMessage('Google Play purchase details are incomplete. Try Restore purchases.');
      return;
    }
    if (!userId || processingTokens.current.has(purchaseToken)) return;

    processingTokens.current.add(purchaseToken);
    setPendingBasePlanIds((current) => [...new Set([...current, basePlanId])]);
    setBusyAction(`verify:${GOOGLE_PREMIUM_PRODUCT_ID}:${basePlanId}`);
    try {
      const result = await purchaseRepository.verifyGooglePurchase({
        basePlanId,
        productId: purchase.productId,
        purchaseToken,
      });
      if (!result.ok) {
        setBusyAction(null);
        if (notify) {
          setMessage(
            isGoogleOwnershipConflict(result.error)
              ? googleOwnershipConflictMessage()
              : `Google Play verification is pending: ${result.error}`,
          );
        }
        return;
      }

      if (purchase.purchaseState === 'pending') {
        setBusyAction(null);
        if (notify) setMessage('Google Play purchase is pending. Premium will activate after payment completes.');
        return;
      }

      await iap.finishTransaction({ purchase, isConsumable: false });
      setAccess(result.value, userId);
      setPendingBasePlanIds((current) => current.filter((id) => id !== basePlanId));
      initiatedBasePlanId.current = null;
      setBusyAction(null);
      if (notify) {
        setMessage(
          hasPremiumAccess(result.value)
            ? 'Trailbook Premium is active.'
            : 'Google Play verified the subscription, but Premium is not currently active.',
        );
      }
    } catch (error) {
      setBusyAction(null);
      if (notify) setMessage(`Google Play purchase completion failed: ${errorMessage(error)}`);
    } finally {
      processingTokens.current.delete(purchaseToken);
    }
  }
  processPurchaseRef.current = processPurchase;

  async function loadProducts() {
    if (!iap.connected || authStatus !== 'authenticated') return;
    setProductLoadError(null);
    setProductLoadState('loading');
    try {
      await iap.fetchProducts({ skus: [GOOGLE_PREMIUM_PRODUCT_ID], type: 'subs' });
      setProductLoadState('loaded');
    } catch (error) {
      setProductLoadError(errorMessage(error));
      setProductLoadState('error');
    }
  }

  useEffect(() => {
    let canceled = false;
    void hydrateAccess(userId).then(() => {
      if (!canceled && authStatus === 'authenticated') void refreshAccess();
    });
    return () => { canceled = true; };
  }, [authStatus, hydrateAccess, refreshAccess, userId]);

  useEffect(() => {
    if (!iap.connected || authStatus !== 'authenticated') return;
    void loadProducts();
    void getAvailablePurchases({ includeSuspendedAndroid: true })
      .then((purchases) => {
        for (const purchase of purchases) void processPurchaseRef.current(purchase, false);
      })
      .catch((error) => console.warn('[Trailbook][google-iap] recovery', errorMessage(error)));
  }, [authStatus, iap.connected, userId]);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setProducts([]);
      return;
    }
    const androidProduct = iap.subscriptions.find(
      (product): product is ProductSubscriptionAndroid =>
        product.platform === 'android' && product.id === GOOGLE_PREMIUM_PRODUCT_ID,
    );
    setProducts(androidProduct ? toPurchaseProducts(androidProduct) : []);
  }, [authStatus, iap.subscriptions, setProducts]);

  const value: GoogleIapContextValue = {
    available: true,
    connected: iap.connected,
    pendingProductIds: pendingBasePlanIds,
    productLoadError,
    productLoadState,
    async manageSubscriptions() {
      setBusyAction('manage-subscription');
      try {
        await deepLinkToSubscriptions({
          packageNameAndroid: ANDROID_PACKAGE_NAME,
          skuAndroid: GOOGLE_PREMIUM_PRODUCT_ID,
        });
        setBusyAction(null);
        await refreshAccess();
      } catch (error) {
        setBusyAction(null);
        setMessage(`Unable to open Google Play subscriptions: ${errorMessage(error)}`);
      }
    },
    async purchase(productId, basePlanId) {
      if (productId !== GOOGLE_PREMIUM_PRODUCT_ID || !basePlanId) {
        setMessage('This Google Play subscription is not supported by Trailbook.');
        return;
      }
      const product = iap.subscriptions.find(
        (item): item is ProductSubscriptionAndroid =>
          item.platform === 'android' && item.id === productId,
      );
      const offer = selectOffer(product, basePlanId);
      if (!offer) {
        setMessage('The selected Google Play subscription offer is unavailable.');
        return;
      }
      const accountResult = await purchaseRepository.getGoogleAccountId();
      if (!accountResult.ok) {
        setMessage(accountResult.error);
        return;
      }
      initiatedBasePlanId.current = basePlanId;
      setBusyAction(`purchase:${productId}:${basePlanId}`);
      setMessage(null);
      try {
        await iap.requestPurchase({
          request: {
            google: {
              obfuscatedAccountId: accountResult.value,
              skus: [productId],
              subscriptionOffers: [{ sku: productId, offerToken: offer.offerToken }],
            },
          },
          type: 'subs',
        });
      } catch (error) {
        initiatedBasePlanId.current = null;
        setBusyAction(null);
        setMessage(
          isUserCancelledPurchase(error)
            ? 'Purchase canceled. No charge was made.'
            : googlePurchaseErrorMessage(error),
        );
      }
    },
    async reloadProducts() { await loadProducts(); },
    async requestRefund() {
      await deepLinkToSubscriptions({
        packageNameAndroid: ANDROID_PACKAGE_NAME,
        skuAndroid: GOOGLE_PREMIUM_PRODUCT_ID,
      });
    },
    async restore() {
      const requestedUserId = userId;
      if (!requestedUserId) return;
      setBusyAction('restore');
      setMessage(null);
      try {
        const purchases = await getAvailablePurchases({ includeSuspendedAndroid: true });
        const known = purchases.filter(
          (purchase) => purchase.store === 'google' && purchase.productId === GOOGLE_PREMIUM_PRODUCT_ID,
        );
        for (const purchase of known) await processPurchaseRef.current(purchase, false);
        const result = await purchaseRepository.getCurrentAccess();
        if (useAuthStore.getState().userId !== requestedUserId) return;
        if (!result.ok) throw new Error(result.error);
        setAccess(result.value, requestedUserId);
        setBusyAction(null);
        setMessage(
          hasPremiumAccess(result.value)
            ? 'Trailbook Premium has been restored.'
            : 'No active Trailbook subscription was found for this account.',
        );
      } catch (error) {
        setBusyAction(null);
        setMessage(`Restore failed: ${errorMessage(error)}`);
      }
    },
  };

  return <GoogleIapContext.Provider value={value}>{children}</GoogleIapContext.Provider>;
}

function toPurchaseProducts(product: ProductSubscriptionAndroid): PurchaseProduct[] {
  return GOOGLE_BASE_PLAN_IDS.flatMap((basePlanId) => {
    const offer = selectOffer(product, basePlanId);
    if (!offer) return [];
    const phases = offer.pricingPhases.pricingPhaseList;
    const recurring = phases.at(-1);
    if (!recurring) return [];
    const hasFreeTrial = phases.some((phase) => phase.priceAmountMicros === '0');
    const billingType: PurchaseBillingType = basePlanId === GOOGLE_YEARLY_BASE_PLAN_ID ? 'yearly' : 'monthly';
    return [{
      basePlanId,
      billingPeriodLabel: billingType === 'yearly' ? 'year' : 'month',
      billingType,
      description: hasFreeTrial
        ? `7 days free, then ${recurring.formattedPrice} per ${billingType === 'yearly' ? 'year' : 'month'}.`
        : product.description,
      entitlements: ['premium'],
      planCode: billingType === 'yearly' ? 'premium_yearly' : 'premium_monthly',
      priceLabel: recurring.formattedPrice,
      productId: product.id,
      provider: 'google',
      title: billingType === 'yearly' ? 'Trailbook Premium Yearly' : 'Trailbook Premium Monthly',
    }];
  });
}

function selectOffer(product: ProductSubscriptionAndroid | undefined, basePlanId: string) {
  const offers = product?.subscriptionOfferDetailsAndroid.filter(
    (offer) => offer.basePlanId === basePlanId,
  ) ?? [];
  return offers.find((offer) => offer.offerId === `${basePlanId}-free-trial`)
    ?? offers.find((offer) => offer.offerId == null)
    ?? offers[0];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isUserCancelledPurchase(error: unknown) {
  return Boolean(
    error && typeof error === 'object' && 'code' in error &&
    String((error as { code?: unknown }).code).toLowerCase().includes('cancel'),
  );
}

function googlePurchaseErrorMessage(error: unknown) {
  if (isUserCancelledPurchase(error)) return 'Purchase canceled. No charge was made.';
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code).toLowerCase()
    : '';
  if (code === 'billing-unavailable' || code === 'service-error') {
    return 'Google Play could not complete the payment. Check your payment method and try again.';
  }
  if (code === 'network-error' || code === 'service-disconnected' || code === 'service-timeout') {
    return 'Google Play is temporarily unavailable. Check your connection and try again.';
  }
  if (code === 'item-unavailable') {
    return 'This Google Play subscription is currently unavailable.';
  }
  if (code === 'already-owned') {
    return 'This Google Play subscription is already owned. Try Restore purchases.';
  }
  return `Google Play purchase failed: ${errorMessage(error)}`;
}

function isGoogleOwnershipConflict(error: string) {
  return error.includes('GOOGLE_ACCOUNT_ID_MISMATCH') ||
    error.includes('GOOGLE_PURCHASE_ALREADY_LINKED_TO_ANOTHER_ACCOUNT');
}

function googleOwnershipConflictMessage() {
  return 'This Google Play subscription is linked to another Trailbook account. Sign in with the original Trailbook account or contact support.';
}
