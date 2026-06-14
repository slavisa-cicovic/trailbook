import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
  PurchaseSimulationResult,
} from "../../domain/purchases";
import { getPurchaseAccess } from "./purchase-api.service";
import type { MobilePurchaseProvider } from "./mobile-purchase-provider";

export class ReadOnlyMobilePurchaseProvider implements MobilePurchaseProvider {
  constructor(private readonly sessionToken: string | null) {}

  async listProducts(): Promise<PurchaseProduct[]> {
    return [];
  }

  async purchase(_input: {
    productId: string;
    scenario?: FakePurchaseScenario;
  }): Promise<PurchaseSimulationResult> {
    throw new Error("Purchase simulation is not available for this session.");
  }

  async refreshAccess(): Promise<PurchaseAccess> {
    if (!this.sessionToken) {
      return {
        currentPeriodEndsAt: null,
        entitlements: [],
        planCode: "demo",
        subscriptionStatus: "active",
      };
    }

    return getPurchaseAccess(this.sessionToken);
  }

  restorePurchases(): Promise<PurchaseAccess> {
    return this.refreshAccess();
  }
}
