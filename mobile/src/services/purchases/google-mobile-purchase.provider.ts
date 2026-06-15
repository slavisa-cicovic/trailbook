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

export class GoogleMobilePurchaseProvider implements MobilePurchaseProvider {
  constructor(private readonly sessionToken: string) {}

  listProducts() {
    return listPurchaseProducts(this.sessionToken, "google");
  }

  async purchase(_input: {
    productId: string;
    scenario?: FakePurchaseScenario;
  }): Promise<PurchaseSimulationResult> {
    throw new Error("Google Play Billing bridge is not available in this build.");
  }

  refreshAccess(): Promise<PurchaseAccess> {
    return getPurchaseAccess(this.sessionToken);
  }

  restorePurchases(): Promise<PurchaseAccess> {
    return this.refreshAccess();
  }

  verifyPurchaseToken(input: {
    productId: string;
    purchaseToken: string;
  }): Promise<PurchaseSimulationResult> {
    return verifyPurchaseWithBackend(this.sessionToken, {
      productId: input.productId,
      provider: "google",
      purchaseToken: input.purchaseToken,
    });
  }
}
