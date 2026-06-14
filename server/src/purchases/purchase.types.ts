import type {
  PlanBillingType,
  PurchaseEnvironment,
  PurchaseEventType,
  PurchaseProvider,
  PurchaseResult,
} from "@prisma/client";

export type PurchaseProviderName = PurchaseProvider;
export type PurchaseEnvironmentName = PurchaseEnvironment;
export type PurchaseEventTypeName = PurchaseEventType;
export type PurchaseResultName = PurchaseResult;

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

export interface PurchaseProductDefinition {
  billingType: PlanBillingType;
  description: string;
  entitlements: string[];
  internalProductCode: string;
  name: string;
  planCode: string;
  priceLabel: string;
  provider: PurchaseProviderName;
  providerProductId: string;
}

export interface PurchaseProductResponse {
  billingType: PlanBillingType;
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
  subscriptionStatus: "active" | "expired" | "canceled" | "lifetime";
}

export interface PurchaseSimulationResponse extends PurchaseAccessResponse {
  purchaseResult: PurchaseResultName;
}

export interface NormalizedPurchaseEvent {
  environment: PurchaseEnvironmentName;
  eventType: PurchaseEventTypeName;
  expiresAt?: string;
  idempotencyKey: string;
  provider: PurchaseProviderName;
  providerOriginalTransactionId?: string;
  providerProductId: string;
  providerTransactionId: string;
  purchaseResult: PurchaseResultName;
  purchasedAt?: string;
  rawPayload: unknown;
  revokedAt?: string;
  userId?: string;
}
