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
import {
  listPendingAppleTransactions,
  recordPendingAppleTransactionFailure,
  removePendingAppleTransaction,
  retryDelayMs,
  savePendingAppleTransaction,
} from './pendingAppleTransactions';
import { usePurchaseStore } from './purchaseStore';

export const APPLE_MONTHLY_PRODUCT_ID = 'trailbook_premium_monthly';
export const APPLE_YEARLY_PRODUCT_ID = 'trailbook_premium_yearly';
const APPLE_PRODUCT_IDS = [APPLE_MONTHLY_PRODUCT_ID, APPLE_YEARLY_PRODUCT_ID];

interface AppleIapContextValue {
  available: boolean;
  connected: boolean;
  pendingProductIds: string[];
  purchase(productId: string): Promise<void>;
  restore(): Promise<void>;
}

const unavailableAppleIap: AppleIapContextValue = {
  available: false,
  connected: false,
  pendingProductIds: [],
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
  const userId = useAuthStore((state) => state.userId);
  const refreshAccess = usePurchaseStore((state) => state.refreshAccess);
  const setAccess = usePurchaseStore((state) => state.setAccess);
  const setBusyAction = usePurchaseStore((state) => state.setBusyAction);
  const setMessage = usePurchaseStore((state) => state.setMessage);
  const setProducts = usePurchaseStore((state) => state.setProducts);
  const [introOfferEligible, setIntroOfferEligible] = useState<boolean | null>(
    null,
  );
  const [pendingProductIds, setPendingProductIds] = useState<string[]>([]);
  const processingTransactions = useRef(new Set<string>());
  const notifiedPendingTransactions = useRef(new Set<string>());
  const retryTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const finishTransactionRef = useRef<
    ReturnType<typeof useIAP>['finishTransaction'] | null
  >(null);
  const processPurchaseRef = useRef<(purchase: Purchase) => Promise<void>>(
    async () => {},
  );

  async function refreshPendingProducts() {
    if (!userId) {
      setPendingProductIds([]);
      return;
    }
    const pending = await listPendingAppleTransactions();
    setPendingProductIds([
      ...new Set(
        pending
          .filter((transaction) => transaction.userId === userId)
          .map((transaction) => transaction.productId),
      ),
    ]);
  }

  async function keepPurchasePending(
    purchase: Purchase,
    transactionId: string,
    reason: string,
    retry: boolean,
  ) {
    const pending = await recordPendingAppleTransactionFailure(
      transactionId,
      reason,
      retry,
    );
    await refreshPendingProducts();
    processingTransactions.current.delete(transactionId);
    setBusyAction(null);
    if (!notifiedPendingTransactions.current.has(transactionId)) {
      notifiedPendingTransactions.current.add(transactionId);
      setMessage(`Purchase verification pending: ${reason}`);
    }

    if (!retry || retryTimers.current.has(transactionId)) return;

    const attemptCount =
      pending.find((transaction) => transaction.transactionId === transactionId)
        ?.attemptCount ?? 1;
    schedulePurchaseRetry(purchase, transactionId, retryDelayMs(attemptCount));
  }

  function schedulePurchaseRetry(
    purchase: Purchase,
    transactionId: string,
    delayMs: number,
  ) {
    if (retryTimers.current.has(transactionId)) return;
    const timer = setTimeout(
      () => {
        retryTimers.current.delete(transactionId);
        void processPurchaseRef.current(purchase);
      },
      Math.max(0, delayMs),
    );
    retryTimers.current.set(transactionId, timer);
  }

  async function processPurchase(purchase: Purchase) {
    if (!APPLE_PRODUCT_IDS.includes(purchase.productId)) return;
    if (purchase.store !== 'apple') return;
    const transactionId = purchase.transactionId;
    if (!transactionId || processingTransactions.current.has(transactionId))
      return;

    if (!userId) {
      setMessage(
        'Purchase verification pending: sign in to your Trailbook account.',
      );
      return;
    }

    const existingPending = (await listPendingAppleTransactions()).find(
      (transaction) => transaction.transactionId === transactionId,
    );
    if (existingPending && existingPending.userId !== userId) {
      setMessage(
        'Purchase verification pending: sign in with the Trailbook account that started this purchase.',
      );
      return;
    }
    if (existingPending?.attemptCount) {
      await refreshPendingProducts();
      if (!existingPending.retryable) return;
      const nextAttemptAt = existingPending.nextAttemptAt
        ? new Date(existingPending.nextAttemptAt).getTime()
        : 0;
      if (nextAttemptAt > Date.now()) {
        schedulePurchaseRetry(
          purchase,
          transactionId,
          nextAttemptAt - Date.now(),
        );
        return;
      }
    }

    const appAccountToken =
      'appAccountToken' in purchase ? purchase.appAccountToken : null;
    await savePendingAppleTransaction({
      appAccountToken,
      productId: purchase.productId,
      transactionId,
      userId,
    });
    await refreshPendingProducts();

    processingTransactions.current.add(transactionId);
    setBusyAction(`verify:${purchase.productId}`);
    const accountTokenResult = await purchaseRepository.getAppleAccountToken();
    if (!accountTokenResult.ok) {
      await keepPurchasePending(
        purchase,
        transactionId,
        accountTokenResult.error,
        true,
      );
      return;
    }
    if (
      appAccountToken &&
      appAccountToken.toLowerCase() !== accountTokenResult.value.toLowerCase()
    ) {
      await keepPurchasePending(
        purchase,
        transactionId,
        'sign in with the Trailbook account that started this purchase.',
        false,
      );
      return;
    }

    const verificationResult = await purchaseRepository.verifyApplePurchase({
      appAccountToken: accountTokenResult.value,
      productId: purchase.productId,
      transactionId,
    });
    if (!verificationResult.ok) {
      await keepPurchasePending(
        purchase,
        transactionId,
        verificationResult.error,
        isRetryableVerificationError(verificationResult.error),
      );
      return;
    }

    try {
      const finishTransaction = finishTransactionRef.current;
      if (!finishTransaction) {
        throw new Error('StoreKit transaction finalizer is unavailable.');
      }
      await finishTransaction({ purchase, isConsumable: false });
      await removePendingAppleTransaction(transactionId);
      await refreshPendingProducts();
      const timer = retryTimers.current.get(transactionId);
      if (timer) clearTimeout(timer);
      retryTimers.current.delete(transactionId);
      notifiedPendingTransactions.current.delete(transactionId);
      setAccess(verificationResult.value);
      setBusyAction(null);
      setMessage('Trailbook Premium is active.');
    } catch (error) {
      await keepPurchasePending(
        purchase,
        transactionId,
        `StoreKit finalization failed: ${errorMessage(error)}`,
        true,
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
    void refreshPendingProducts();
    for (const timer of retryTimers.current.values()) clearTimeout(timer);
    retryTimers.current.clear();
    notifiedPendingTransactions.current.clear();
  }, [userId]);

  useEffect(
    () => () => {
      for (const timer of retryTimers.current.values()) clearTimeout(timer);
      retryTimers.current.clear();
    },
    [],
  );

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
    pendingProductIds,
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

function isRetryableVerificationError(error: string) {
  const statusMatch = error.match(/HTTP (\d{3})/i);
  if (!statusMatch) return true;
  const status = Number(statusMatch[1]);
  return status === 408 || status === 429 || status >= 500;
}
