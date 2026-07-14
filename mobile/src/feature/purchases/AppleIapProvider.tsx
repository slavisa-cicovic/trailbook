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
import type {
  ActiveSubscription,
  ProductSubscription,
  Purchase,
} from 'expo-iap';

import { purchaseRepository } from '@/core/data/repository/PurchaseRepositoryImpl';
import type {
  PurchaseAccess,
  PurchaseBillingType,
  PurchaseProduct,
} from '@/core/domain/model/purchase';
import { hasPremiumAccess } from '@/core/domain/model/purchase';
import { useAuthStore } from '@/feature/auth/authStore';
import {
  listPendingAppleTransactions,
  recordPendingAppleTransactionFailure,
  removePendingAppleTransaction,
  removeStalePendingAppleTransactions,
  retryDelayMs,
  savePendingAppleTransaction,
} from './pendingAppleTransactions';
import { usePurchaseStore } from './purchaseStore';

export const APPLE_MONTHLY_PRODUCT_ID = 'trailbook_premium_monthly';
export const APPLE_YEARLY_PRODUCT_ID = 'trailbook_premium_yearly';
const APPLE_PRODUCT_IDS = [APPLE_MONTHLY_PRODUCT_ID, APPLE_YEARLY_PRODUCT_ID];
type ApplePurchaseProcessingResult =
  | 'ignored'
  | 'ownership-conflict'
  | 'pending'
  | 'retry-required'
  | 'verified';

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
  const {
    getActiveSubscriptions,
    getAvailablePurchases,
    isEligibleForIntroOfferIOS,
    restorePurchases: restoreApplePurchases,
    useIAP,
  } = require('expo-iap') as typeof import('expo-iap');
  const authStatus = useAuthStore((state) => state.status);
  const userId = useAuthStore((state) => state.userId);
  const refreshAccess = usePurchaseStore((state) => state.refreshAccess);
  const hydrateAccess = usePurchaseStore((state) => state.hydrateAccess);
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
  const processPurchaseRef = useRef<
    (
      purchase: Purchase,
      notify?: boolean,
    ) => Promise<ApplePurchaseProcessingResult>
  >(async () => 'ignored');

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
    notify: boolean,
  ) {
    const pending = await recordPendingAppleTransactionFailure(
      transactionId,
      reason,
      retry,
    );
    await refreshPendingProducts();
    processingTransactions.current.delete(transactionId);
    setBusyAction(null);
    if (notify && !notifiedPendingTransactions.current.has(transactionId)) {
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

  async function processPurchase(
    purchase: Purchase,
    notify = true,
  ): Promise<ApplePurchaseProcessingResult> {
    if (!APPLE_PRODUCT_IDS.includes(purchase.productId)) return 'ignored';
    if (purchase.store !== 'apple') return 'ignored';
    const transactionId = purchase.transactionId;
    if (!transactionId || processingTransactions.current.has(transactionId))
      return 'ignored';

    if (!userId) {
      if (notify) {
        setMessage(
          'Purchase verification pending: sign in to your Trailbook account.',
        );
      }
      return 'pending';
    }

    const existingPending = (await listPendingAppleTransactions()).find(
      (transaction) => transaction.transactionId === transactionId,
    );
    if (existingPending && existingPending.userId !== userId) {
      if (notify) setMessage(appleOwnershipConflictMessage());
      return 'ownership-conflict';
    }
    if (existingPending?.attemptCount) {
      await refreshPendingProducts();
      if (!existingPending.retryable) return 'pending';
      const nextAttemptAt = existingPending.nextAttemptAt
        ? new Date(existingPending.nextAttemptAt).getTime()
        : 0;
      if (nextAttemptAt > Date.now()) {
        schedulePurchaseRetry(
          purchase,
          transactionId,
          nextAttemptAt - Date.now(),
        );
        return 'pending';
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
        notify,
      );
      return 'pending';
    }
    if (
      appAccountToken &&
      appAccountToken.toLowerCase() !== accountTokenResult.value.toLowerCase()
    ) {
      await removePendingAppleTransaction(transactionId);
      await refreshPendingProducts();
      processingTransactions.current.delete(transactionId);
      setBusyAction(null);
      if (notify) setMessage(appleOwnershipConflictMessage());
      return 'ownership-conflict';
    }

    const verificationResult = await purchaseRepository.verifyApplePurchase({
      appAccountToken: accountTokenResult.value,
      productId: purchase.productId,
      transactionId,
    });
    if (!verificationResult.ok) {
      if (isAppleOwnershipConflict(verificationResult.error)) {
        await removePendingAppleTransaction(transactionId);
        await refreshPendingProducts();
        processingTransactions.current.delete(transactionId);
        setBusyAction(null);
        if (notify) setMessage(appleOwnershipConflictMessage());
        return 'ownership-conflict';
      }
      await keepPurchasePending(
        purchase,
        transactionId,
        verificationResult.error,
        isRetryableVerificationError(verificationResult.error),
        notify,
      );
      return 'pending';
    }

    try {
      const finishTransaction = finishTransactionRef.current;
      if (!finishTransaction) {
        throw new Error('StoreKit transaction finalizer is unavailable.');
      }
      await finishTransaction({ purchase, isConsumable: false });
      await removePendingAppleTransaction(transactionId);
      await refreshPendingProducts();
      processingTransactions.current.delete(transactionId);
      const timer = retryTimers.current.get(transactionId);
      if (timer) clearTimeout(timer);
      retryTimers.current.delete(transactionId);
      notifiedPendingTransactions.current.delete(transactionId);
      setAccess(verificationResult.value, userId);
      setBusyAction(null);
      if (notify) setMessage(verifiedPurchaseMessage(verificationResult.value));
      return 'verified';
    } catch (error) {
      if (isAlreadyFinishedTransactionError(error)) {
        await removePendingAppleTransaction(transactionId);
        await refreshPendingProducts();
        const timer = retryTimers.current.get(transactionId);
        if (timer) clearTimeout(timer);
        retryTimers.current.delete(transactionId);
        notifiedPendingTransactions.current.delete(transactionId);
        processingTransactions.current.delete(transactionId);
        setAccess(verificationResult.value, userId);
        setBusyAction(null);
        if (notify) setMessage('Trailbook purchase status refreshed.');
        return 'verified';
      }
      await keepPurchasePending(
        purchase,
        transactionId,
        `StoreKit finalization failed: ${errorMessage(error)}`,
        true,
        notify,
      );
      return 'pending';
    }
  }

  async function verifyRestoredSubscription(
    subscription: ActiveSubscription,
  ): Promise<ApplePurchaseProcessingResult> {
    if (!APPLE_PRODUCT_IDS.includes(subscription.productId)) return 'ignored';
    if (!subscription.transactionId || !userId) return 'retry-required';

    const accountTokenResult = await purchaseRepository.getAppleAccountToken();
    if (!accountTokenResult.ok) return 'retry-required';

    const verificationResult = await purchaseRepository.verifyApplePurchase({
      appAccountToken: accountTokenResult.value,
      productId: subscription.productId,
      transactionId: subscription.transactionId,
    });
    if (!verificationResult.ok) {
      return isAppleOwnershipConflict(verificationResult.error)
        ? 'ownership-conflict'
        : 'retry-required';
    }

    setAccess(verificationResult.value, userId);
    return 'verified';
  }

  processPurchaseRef.current = processPurchase;

  const iap = useIAP({
    onError(error) {
      console.warn('[Trailbook][apple-iap]', errorMessage(error));
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
    let canceled = false;
    void hydrateAccess(userId).then(() => {
      if (!canceled && authStatus === 'authenticated') void refreshAccess();
    });
    return () => {
      canceled = true;
    };
  }, [authStatus, hydrateAccess, refreshAccess, userId]);

  useEffect(() => {
    if (!iap.connected || authStatus !== 'authenticated') return;
    void iap.fetchProducts({ skus: APPLE_PRODUCT_IDS, type: 'subs' });
    void getAvailablePurchases({
      alsoPublishToEventListenerIOS: false,
      onlyIncludeActiveItemsIOS: false,
    }).then((purchases) => {
      for (const purchase of purchases) {
        void processPurchaseRef.current(purchase, false);
      }
    });
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
      const requestedUserId = userId;
      if (!requestedUserId) {
        setMessage('Sign in to restore Trailbook Premium.');
        return;
      }
      setBusyAction('restore');
      setMessage(null);
      try {
        await restoreApplePurchases();
        const purchases = await getAvailablePurchases({
          alsoPublishToEventListenerIOS: false,
          onlyIncludeActiveItemsIOS: false,
        });
        const activeSubscriptions =
          await getActiveSubscriptions(APPLE_PRODUCT_IDS);
        const knownPurchases = purchases.filter(
          (purchase) =>
            purchase.store === 'apple' &&
            APPLE_PRODUCT_IDS.includes(purchase.productId),
        );
        await removeStalePendingAppleTransactions(
          requestedUserId,
          new Set([
            ...knownPurchases
              .map((purchase) => purchase.transactionId)
              .filter(isTransactionId),
            ...activeSubscriptions.map(
              (subscription) => subscription.transactionId,
            ).filter(isTransactionId),
          ]),
        );
        await refreshPendingProducts();
        const outcomes: ApplePurchaseProcessingResult[] = [];
        for (const purchase of knownPurchases) {
          outcomes.push(await processPurchaseRef.current(purchase, false));
        }
        const processedTransactionIds = new Set(
          knownPurchases.map((purchase) => purchase.transactionId),
        );
        for (const subscription of activeSubscriptions) {
          if (processedTransactionIds.has(subscription.transactionId)) continue;
          outcomes.push(await verifyRestoredSubscription(subscription));
        }

        if (outcomes.includes('ownership-conflict')) {
          setBusyAction(null);
          setMessage(appleOwnershipConflictMessage());
          return;
        }
        if (outcomes.includes('pending')) {
          setBusyAction(null);
          setMessage(
            'Apple purchase found. Backend verification is pending and will retry automatically.',
          );
          return;
        }
        if (outcomes.includes('retry-required')) {
          setBusyAction(null);
          setMessage(
            'Restore could not be verified. Check your connection and try Restore purchases again.',
          );
          return;
        }

        const accessResult = await purchaseRepository.getCurrentAccess();
        if (useAuthStore.getState().userId !== requestedUserId) return;
        if (!accessResult.ok) {
          setBusyAction(null);
          setMessage(`Restore failed: ${accessResult.error}`);
          return;
        }
        setAccess(accessResult.value, requestedUserId);
        setBusyAction(null);
        setMessage(
          hasPremiumAccess(accessResult.value)
            ? 'Trailbook Premium has been restored.'
            : 'No active Trailbook subscription was found for this account.',
        );
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
      introductoryOfferLabel(product, introOfferEligible) ??
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

function verifiedPurchaseMessage(access: PurchaseAccess) {
  if (access.subscriptionStatus === 'billing_retry') {
    return 'The Apple purchase was verified, but the subscription has a billing issue.';
  }
  if (access.subscriptionStatus === 'revoked') {
    return 'The Apple purchase was verified, but the subscription was revoked.';
  }
  if (hasPremiumAccess(access)) return 'Trailbook Premium is active.';
  return 'The Apple purchase was verified, but there is no active Trailbook subscription.';
}

function introductoryOfferLabel(
  product: ProductSubscription,
  introOfferEligible: boolean,
) {
  if (product.platform !== 'ios') return null;
  const standardizedOffer = product.subscriptionOffers?.find(
    (offer) => offer.type === 'introductory',
  );
  const iosPeriods = product.introductoryPriceNumberOfPeriodsIOS;
  const standardizedPeriodCount =
    standardizedOffer?.periodCount ??
    standardizedOffer?.numberOfPeriodsIOS ??
    1;
  const periods = iosPeriods ?? (
    standardizedOffer?.period?.value
      ? standardizedOffer.period.value * standardizedPeriodCount
      : null
  );
  const unit =
    product.introductoryPriceSubscriptionPeriodIOS ??
    standardizedOffer?.period?.unit;
  const paymentMode =
    product.introductoryPricePaymentModeIOS ?? standardizedOffer?.paymentMode;
  const price =
    product.introductoryPriceIOS ?? standardizedOffer?.displayPrice;
  if (!price && paymentMode !== 'free-trial') return null;
  if (
    paymentMode === 'free-trial' &&
    periods &&
    unit
  ) {
    const duration = periodLabel(Number(periods), unit);
    return introOfferEligible
      ? `Free for ${duration}. Then the standard subscription price applies.`
      : `${duration} free trial for eligible new subscribers.`;
  }
  return periods && unit
    ? `${price} introductory offer for ${periodLabel(Number(periods), unit)}.`
    : `${price} introductory offer`;
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

function isTransactionId(value: string | null | undefined): value is string {
  return Boolean(value);
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

function isAlreadyFinishedTransactionError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if ((error as { code?: unknown }).code === 'receipt-finished') return true;
  }
  return /receipt already finished/i.test(errorMessage(error));
}

function isRetryableVerificationError(error: string) {
  const statusMatch = error.match(/HTTP (\d{3})/i);
  if (!statusMatch) return true;
  const status = Number(statusMatch[1]);
  return status === 408 || status === 429 || status >= 500;
}

function isAppleOwnershipConflict(error: string) {
  return (
    error.includes('APPLE_PURCHASE_ALREADY_LINKED_TO_ANOTHER_ACCOUNT') ||
    error.includes('APPLE_PURCHASE_OWNERSHIP_CONFLICT') ||
    error.includes('APPLE_ACCOUNT_TOKEN_MISMATCH')
  );
}

function appleOwnershipConflictMessage() {
  return 'This Apple subscription is linked to another Trailbook account. Sign in with the original Trailbook account or contact support.';
}
