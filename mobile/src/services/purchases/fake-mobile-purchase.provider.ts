import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
  PurchaseSimulationResult,
} from "../../domain/purchases";
import type { MobilePurchaseProvider } from "./mobile-purchase-provider";
import {
  getPurchaseAccess,
  listPurchaseProducts,
  simulateFakePurchase,
} from "./purchase-api.service";

export class FakeMobilePurchaseProvider implements MobilePurchaseProvider {
  constructor(private readonly sessionToken: string) {}

  listProducts(): Promise<PurchaseProduct[]> {
    return listPurchaseProducts(this.sessionToken);
  }

  purchase(input: {
    productId: string;
    scenario?: FakePurchaseScenario;
  }): Promise<PurchaseSimulationResult> {
    return simulateFakePurchase(this.sessionToken, input);
  }

  refreshAccess(): Promise<PurchaseAccess> {
    return getPurchaseAccess(this.sessionToken);
  }

  async restorePurchases(): Promise<PurchaseAccess> {
    return this.refreshAccess();
  }
}
