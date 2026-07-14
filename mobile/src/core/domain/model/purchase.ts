export type PurchaseBillingType = 'monthly' | 'yearly' | 'lifetime';
export type PurchaseProviderName = 'fake' | 'apple' | 'google';
export type PurchaseEnvironmentName = 'local' | 'sandbox' | 'production';
export type PurchaseSubscriptionStatus =
  | 'active'
  | 'billing_retry'
  | 'canceled'
  | 'expired'
  | 'in_grace_period'
  | 'lifetime'
  | 'revoked';
export type PurchaseResult =
  | 'success'
  | 'canceled_by_user'
  | 'declined'
  | 'pending'
  | 'failed';
export type FakePurchaseScenario =
  | 'success'
  | 'renew'
  | 'subscription_canceled'
  | 'expired'
  | 'refund'
  | 'revoke'
  | 'decline'
  | 'cancel'
  | 'pending'
  | 'restore';

export interface PurchaseProduct {
  billingPeriodLabel?: string;
  billingType: PurchaseBillingType;
  description: string;
  entitlements: string[];
  planCode: string;
  priceLabel: string;
  productId: string;
  provider: PurchaseProviderName;
  title: string;
}

export interface PurchaseAccess {
  currentPeriodEndsAt: string | null;
  entitlements: string[];
  environment?: PurchaseEnvironmentName;
  planCode: string;
  provider?: PurchaseProviderName;
  subscriptionStatus: PurchaseSubscriptionStatus;
}

export interface PurchaseSimulationResult extends PurchaseAccess {
  purchaseResult: PurchaseResult;
}

export interface ApplePurchaseVerificationInput {
  appAccountToken: string;
  productId: string;
  transactionId: string;
}

export interface LocalTestTripAllowance {
  available: boolean;
  tripClientId: string | null;
  usedAt: string | null;
}

export function hasPremiumAccess(
  access: PurchaseAccess | null | undefined,
): access is PurchaseAccess {
  return Boolean(
    access && access.planCode !== 'demo' && access.entitlements.length > 0,
  );
}
