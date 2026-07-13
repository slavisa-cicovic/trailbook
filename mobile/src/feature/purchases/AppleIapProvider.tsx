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
import type { ProductSubscription, Purchase } from 'expo-iap';

import { purchaseRepository } from '@/core/data/repository/PurchaseRepositoryImpl';
import type {
  PurchaseBillingType,
  PurchaseProduct,
} from '@/core/domain/model/purchase';
import { useAuthStore } from '@/feature/auth/authStore';
import { usePurchaseStore } from './purchaseStore';

export const APPLE_MONTHLY_PRODUCT_ID = 'trailbook_premium_monthly';
export const APPLE_YEARLY_PRODUCT_ID = 'trailbook_premium_yearly';
const APPLE_PRODUCT_IDS = [APPLE_MONTHLY_PRODUCT_ID, APPLE_YEARLY_PRODUCT_ID];

interface AppleIapContextValue {
  available: boolean;
  connected: boolean;
  purchase(productId: string): Promise<void>;
  restore(): Promise<void>;
}

const unavailableAppleIap: AppleIapContextValue = {
  available: false,
  connected: false,
  async purchase() {},
  async restore() {},
};

const AppleIapContext =
  createContext<AppleIapContextValue>(unavailableAppleIap);

export function AppleIapProvider({ children }: PropsWithChildren) {
  const nativeIapAvailable =
    Platform.OS === 'ios' &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

  if (!nativeIapAvailable) {
    return (
      <AppleIapContext.Provider value={unavailableAppleIap}>
        {children}
      </AppleIapContext.Provider>
    );
  }

  return <NativeAppleIapProvider>{children}</NativeAppleIapProvider>;
}

export function useAppleIap() {
  return useContext(AppleIapContext);
}

function NativeAppleIapProvider({ children }: PropsWithChildren) {
  // Runtime require keeps Expo Go from loading a native module it cannot provide.
  const { isEligibleForIntroOfferIOS, useIAP } =
    require('expo-iap') as typeof import('expo-iap');
  const authStatus = useAuthStore((state) => state.status);
  const refreshAccess = usePurchaseStore((state) => state.refreshAccess);
  const setAccess = usePurchaseStore((state) => state.setAccess);
  const setBusyAction = usePurchaseStore((state) => state.setBusyAction);
  const setMessage = usePurchaseStore((state) => state.setMessage);
  const setProducts = usePurchaseStore((state) => state.setProducts);
  const [introOfferEligible, setIntroOfferEligible] = useState<boolean | null>(
    null,
  );
  const processingTransactions = useRef(new Set<string>());
  const finishTransactionRef = useRef<
    ReturnType<typeof useIAP>['finishTransaction'] | null
  >(null);
  const processPurchaseRef = useRef<(purchase: Purchase) => Promise<void>>(
    async () => {},
  );

  async function processPurchase(purchase: Purchase) {
    if (!APPLE_PRODUCT_IDS.includes(purchase.productId)) return;
    if (purchase.store !== 'apple') return;
    const transactionId = purchase.transactionId;
    if (!transactionId || processingTransactions.current.has(transactionId))
      return;

    processingTransactions.current.add(transactionId);
    setBusyAction(`verify:${purchase.productId}`);
    const accountTokenResult = await purchaseRepository.getAppleAccountToken();
    if (!accountTokenResult.ok) {
      processingTransactions.current.delete(transactionId);
      setBusyAction(null);
      setMessage(`Purchase verification pending: ${accountTokenResult.error}`);
      return;
    }

    const verificationResult = await purchaseRepository.verifyApplePurchase({
      appAccountToken: accountTokenResult.value,
      productId: purchase.productId,
      transactionId,
    });
    if (!verificationResult.ok) {
      processingTransactions.current.delete(transactionId);
      setBusyAction(null);
      setMessage(`Purchase verification pending: ${verificationResult.error}`);
      return;
    }

    try {
      await finishTransactionRef.current?.({ purchase, isConsumable: false });
      setAccess(verificationResult.value);
      setBusyAction(null);
      setMessage('Trailbook Premium is active.');
    } catch (error) {
      processingTransactions.current.delete(transactionId);
      setBusyAction(null);
      setMessage(
        `Purchase verified, but StoreKit finalization failed: ${errorMessage(error)}`,
      );
    }
  }

  processPurchaseRef.current = processPurchase;

  const iap = useIAP({
    onError(error) {
      setMessage(errorMessage(error));
    },
    onPurchaseError(error) {
      setBusyAction(null);
      setMessage(
        error.code === 'user-cancelled'
          ? 'Purchase canceled. No charge was made.'
          : `Apple purchase failed: ${error.message}`,
      );
    },
    onPurchaseSuccess(purchase) {
      void processPurchaseRef.current(purchase);
    },
  });

  finishTransactionRef.current = iap.finishTransaction;

  useEffect(() => {
    if (!iap.connected || authStatus !== 'authenticated') return;
    void iap.fetchProducts({ skus: APPLE_PRODUCT_IDS, type: 'subs' });
    void iap.getAvailablePurchases();
    void refreshAccess();
  }, [authStatus, iap.connected]);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setProducts([]);
      return;
    }
    setProducts(
      iap.subscriptions
        .map((product) =>
          toPurchaseProduct(product, introOfferEligible === true),
        )
        .filter(isKnownProduct),
    );
  }, [authStatus, iap.subscriptions, introOfferEligible, setProducts]);

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      setIntroOfferEligible(null);
      return;
    }
    const iosSubscription = iap.subscriptions.find(
      (product) => product.platform === 'ios',
    );
    const groupId =
      iosSubscription?.platform === 'ios'
        ? iosSubscription.subscriptionGroupIdIOS
        : null;
    if (!groupId) {
      setIntroOfferEligible(null);
      return;
    }

    let canceled = false;
    void isEligibleForIntroOfferIOS(groupId)
      .then((eligible) => {
        if (!canceled) setIntroOfferEligible(eligible);
      })
      .catch(() => {
        if (!canceled) setIntroOfferEligible(false);
      });
    return () => {
      canceled = true;
    };
  }, [authStatus, iap.subscriptions, isEligibleForIntroOfferIOS]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    for (const purchase of iap.availablePurchases) {
      void processPurchaseRef.current(purchase);
    }
  }, [authStatus, iap.availablePurchases]);

  const value: AppleIapContextValue = {
    available: true,
    connected: iap.connected,
    async purchase(productId) {
      if (!APPLE_PRODUCT_IDS.includes(productId)) {
        setMessage('This Apple product is not supported by Trailbook.');
        return;
      }
      setBusyAction(`purchase:${productId}`);
      const tokenResult = await purchaseRepository.getAppleAccountToken();
      if (!tokenResult.ok) {
        setBusyAction(null);
        setMessage(tokenResult.error);
        return;
      }
      try {
        await iap.requestPurchase({
          request: {
            apple: {
              andDangerouslyFinishTransactionAutomatically: false,
              appAccountToken: tokenResult.value,
              sku: productId,
            },
          },
          type: 'subs',
        });
      } catch (error) {
        setBusyAction(null);
        setMessage(
          isUserCancelledPurchase(error)
            ? 'Purchase canceled. No charge was made.'
            : `Unable to start Apple purchase: ${errorMessage(error)}`,
        );
      }
    },
    async restore() {
      setBusyAction('restore');
      setMessage(null);
      try {
        await iap.restorePurchases();
        await iap.getAvailablePurchases();
        await refreshAccess();
        setBusyAction(null);
        setMessage('Purchase restoration finished.');
      } catch (error) {
        setBusyAction(null);
        setMessage(`Restore failed: ${errorMessage(error)}`);
      }
    },
  };

  return (
    <AppleIapContext.Provider value={value}>
      {children}
    </AppleIapContext.Provider>
  );
}

function toPurchaseProduct(
  product: ProductSubscription,
  introOfferEligible: boolean,
): PurchaseProduct {
  return {
    billingPeriodLabel: recurringPeriodLabel(product),
    billingType: billingType(product.id),
    description:
      (introOfferEligible ? introductoryOfferLabel(product) : null) ??
      product.description,
    entitlements: ['premium'],
    planCode:
      billingType(product.id) === 'yearly'
        ? 'premium_yearly'
        : 'premium_monthly',
    priceLabel: product.displayPrice,
    productId: product.id,
    provider: 'apple',
    title: product.displayName ?? product.title,
  };
}

function billingType(productId: string): PurchaseBillingType {
  return productId === APPLE_YEARLY_PRODUCT_ID ? 'yearly' : 'monthly';
}

function introductoryOfferLabel(product: ProductSubscription) {
  if (product.platform !== 'ios' || !product.introductoryPriceIOS) return null;
  const periods = product.introductoryPriceNumberOfPeriodsIOS;
  const unit = product.introductoryPriceSubscriptionPeriodIOS;
  if (
    product.introductoryPricePaymentModeIOS === 'free-trial' &&
    periods &&
    unit
  ) {
    return `Free for ${periodLabel(Number(periods), unit)} for eligible new subscribers.`;
  }
  return periods && unit
    ? `${product.introductoryPriceIOS} introductory offer for ${periodLabel(Number(periods), unit)}.`
    : `${product.introductoryPriceIOS} introductory offer`;
}

function recurringPeriodLabel(product: ProductSubscription) {
  if (product.platform !== 'ios') return undefined;
  const periods = Number(product.subscriptionPeriodNumberIOS);
  const unit = product.subscriptionPeriodUnitIOS;
  return periods && unit ? periodLabel(periods, unit) : undefined;
}

function periodLabel(periods: number, unit: string) {
  return `${periods} ${unit}${periods === 1 ? '' : 's'}`;
}

function isKnownProduct(product: PurchaseProduct) {
  return APPLE_PRODUCT_IDS.includes(product.productId);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isUserCancelledPurchase(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if ((error as { code?: unknown }).code === 'user-cancelled') return true;
  }

  return /user cancel(?:led|ed)/i.test(errorMessage(error));
}
