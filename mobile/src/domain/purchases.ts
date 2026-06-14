export type PurchaseProviderName = "fake" | "apple" | "google";
export type PurchaseEnvironmentName = "local" | "sandbox" | "production";
export type PurchaseBillingType = "none" | "monthly" | "yearly" | "lifetime";
export type PurchaseResult = "success" | "canceled_by_user" | "declined" | "pending" | "failed";
export type PurchaseSubscriptionStatus = "active" | "expired" | "canceled" | "lifetime";

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
