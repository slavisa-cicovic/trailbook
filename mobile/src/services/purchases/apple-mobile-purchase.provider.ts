import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseSimulationResult,
} from "../../domain/purchases";
import type { MobilePurchaseProvider } from "./mobile-purchase-provider";
import {
  getPurchaseAccess,
  listPurchaseProducts,
  verifyPurchaseWithBackend,
} from "./purchase-api.service";

export class AppleMobilePurchaseProvider implements MobilePurchaseProvider {
  constructor(private readonly sessionToken: string) {}

  listProducts() {
    return listPurchaseProducts(this.sessionToken, "apple");
  }

  async purchase(_input: {
    productId: string;
    scenario?: FakePurchaseScenario;
  }): Promise<PurchaseSimulationResult> {
    throw new Error("Apple StoreKit purchase bridge is not available in this build.");
  }

  refreshAccess(): Promise<PurchaseAccess> {
    return getPurchaseAccess(this.sessionToken);
  }

  restorePurchases(): Promise<PurchaseAccess> {
    return this.refreshAccess();
  }

  verifyTransaction(input: {
    productId: string;
    transactionId: string;
  }): Promise<PurchaseSimulationResult> {
    return verifyPurchaseWithBackend(this.sessionToken, {
      productId: input.productId,
      provider: "apple",
      transactionId: input.transactionId,
    });
  }
}
