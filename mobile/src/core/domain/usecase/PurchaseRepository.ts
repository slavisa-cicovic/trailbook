import type { Result } from '@/core/common/result';
import type {
  FakePurchaseScenario,
  PurchaseAccess,
  LocalTestTripAllowance,
  ApplePurchaseVerificationInput,
  GooglePurchaseVerificationInput,
  PurchaseProduct,
  PurchaseSimulationResult,
} from '@/core/domain/model/purchase';

export interface PurchaseRepository {
  getAppleAccountToken(): Promise<Result<string>>;
  getGoogleAccountId(): Promise<Result<string>>;
  getCurrentAccess(): Promise<Result<PurchaseAccess>>;
  getFakeProducts(): Promise<Result<PurchaseProduct[]>>;
  simulateFakePurchase(input: {
    productId: string;
    scenario: FakePurchaseScenario;
  }): Promise<Result<PurchaseSimulationResult>>;
  verifyApplePurchase(input: ApplePurchaseVerificationInput): Promise<Result<PurchaseAccess>>;
  verifyGooglePurchase(input: GooglePurchaseVerificationInput): Promise<Result<PurchaseAccess>>;
  getLocalTestTripAllowance(): Promise<Result<LocalTestTripAllowance>>;
  consumeLocalTestTripAllowance(clientTripId: string): Promise<Result<LocalTestTripAllowance>>;
}
