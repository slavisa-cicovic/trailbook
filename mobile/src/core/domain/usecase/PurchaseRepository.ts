import type { Result } from '@/core/common/result';
import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
  PurchaseSimulationResult,
} from '@/core/domain/model/purchase';

export interface PurchaseRepository {
  getCurrentAccess(): Promise<Result<PurchaseAccess>>;
  getFakeProducts(): Promise<Result<PurchaseProduct[]>>;
  simulateFakePurchase(input: {
    productId: string;
    scenario: FakePurchaseScenario;
  }): Promise<Result<PurchaseSimulationResult>>;
}
