import type {
  FakePurchaseScenario,
  NormalizedPurchaseEvent,
  PurchaseProductResponse,
  PurchaseProviderName,
} from "./purchase.types";

export interface PurchaseProvider {
  provider: PurchaseProviderName;

  listProducts(input: {
    platform?: "android" | "ios" | "web";
    userId: string;
  }): Promise<PurchaseProductResponse[]>;

  completePurchase(input: {
    providerProductId: string;
    purchaseToken?: string;
    scenario?: FakePurchaseScenario;
    transactionId?: string;
    userId: string;
  }): Promise<NormalizedPurchaseEvent | null>;

  refreshSubscription(input: {
    providerOriginalTransactionId?: string;
    subscriptionId?: string;
    userId?: string;
  }): Promise<NormalizedPurchaseEvent[]>;
}
