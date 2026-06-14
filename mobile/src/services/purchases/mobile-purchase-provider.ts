import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
  PurchaseSimulationResult,
} from "../../domain/purchases";

export interface MobilePurchaseProvider {
  listProducts(): Promise<PurchaseProduct[]>;
  purchase(input: {
    productId: string;
    scenario?: FakePurchaseScenario;
  }): Promise<PurchaseSimulationResult>;
  refreshAccess(): Promise<PurchaseAccess>;
  restorePurchases(): Promise<PurchaseAccess>;
}
