import type { Result } from '@/core/common/result';
import type {
  FakePurchaseScenario,
  PurchaseAccess,
  ApplePurchaseVerificationInput,
  PurchaseProduct,
  PurchaseSimulationResult,
} from '@/core/domain/model/purchase';

export interface PurchaseRepository {
  getAppleAccountToken(): Promise<Result<string>>;
  getCurrentAccess(): Promise<Result<PurchaseAccess>>;
  getFakeProducts(): Promise<Result<PurchaseProduct[]>>;
  simulateFakePurchase(input: {
    productId: string;
    scenario: FakePurchaseScenario;
  }): Promise<Result<PurchaseSimulationResult>>;
  verifyApplePurchase(input: ApplePurchaseVerificationInput): Promise<Result<PurchaseAccess>>;
}
