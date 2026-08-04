export type PurchaseProviderName = "fake" | "apple" | "google";
export type PurchaseEnvironmentName = "local" | "sandbox" | "production";
export type PurchaseBillingType = "monthly" | "yearly" | "lifetime";
export type PurchaseSubscriptionStatus =
  | "active"
  | "billing_retry"
  | "canceled"
  | "expired"
  | "in_grace_period"
  | "lifetime"
  | "revoked";
export type PurchaseResultName =
  | "success"
  | "canceled_by_user"
  | "declined"
  | "pending"
  | "failed";
export type PurchaseEventType =
  | "PURCHASED"
  | "RENEWED"
  | "CANCELED"
  | "EXPIRED"
  | "REFUNDED"
  | "REVOKED"
  | "DECLINED"
  | "PENDING"
  | "RESTORED";
export type FakePurchaseScenario =
  | "success"
  | "renew"
  | "subscription_canceled"
  | "expired"
  | "refund"
  | "revoke"
  | "decline"
  | "cancel"
  | "pending"
  | "restore";

export interface PurchaseProduct {
  basePlanId?: string;
  billingType: PurchaseBillingType;
  description: string;
  entitlements: string[];
  planCode: string;
  priceLabel: string;
  productId: string;
  provider: PurchaseProviderName;
  title: string;
}

export interface PurchaseAccessResponse {
  currentPeriodEndsAt: string | null;
  entitlements: string[];
  environment?: PurchaseEnvironmentName;
  planCode: string;
  provider?: PurchaseProviderName;
  subscriptionStatus: PurchaseSubscriptionStatus;
}

export interface PurchaseSimulationResponse extends PurchaseAccessResponse {
  purchaseResult: PurchaseResultName;
}

export interface NormalizedPurchaseEvent {
  autoRenewEnabled?: boolean;
  environment: PurchaseEnvironmentName;
  eventType: PurchaseEventType;
  expiresAt?: string;
  idempotencyKey: string;
  originalTransactionId?: string;
  provider: PurchaseProviderName;
  providerBasePlanId?: string;
  providerProductId: string;
  purchasedAt?: string;
  rawPayload: unknown;
  result: PurchaseResultName;
  revokedAt?: string;
  subscriptionStatus?: PurchaseSubscriptionStatus;
  transactionId: string;
  userId: string;
  verifiedAt?: string;
}

export interface ApplePurchaseVerificationInput {
  appAccountToken: string;
  productId: string;
  transactionId: string;
  userId: string;
}

export interface GooglePurchaseVerificationInput {
  basePlanId: string;
  productId: string;
  purchaseToken: string;
  userId: string;
}
