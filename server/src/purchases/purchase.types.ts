export type PurchaseProviderName = "fake" | "apple" | "google";
export type PurchaseEnvironmentName = "local" | "sandbox" | "production";
export type PurchaseBillingType = "monthly" | "yearly" | "lifetime";
export type PurchaseSubscriptionStatus = "active" | "expired" | "canceled" | "lifetime";
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
  environment: PurchaseEnvironmentName;
  eventType: PurchaseEventType;
  expiresAt?: string;
  idempotencyKey: string;
  originalTransactionId?: string;
  provider: PurchaseProviderName;
  providerProductId: string;
  purchasedAt?: string;
  rawPayload: unknown;
  result: PurchaseResultName;
  revokedAt?: string;
  transactionId: string;
  userId: string;
}
