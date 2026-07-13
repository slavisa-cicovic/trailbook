import type { PurchaseRepository } from '@/core/domain/usecase/PurchaseRepository';
import type {
  FakePurchaseScenario,
  ApplePurchaseVerificationInput,
  PurchaseAccess,
  PurchaseProduct,
  PurchaseSimulationResult,
} from '@/core/domain/model/purchase';
import type { Result } from '@/core/common/result';
import {
  remotePurchaseDataSource,
  type RemotePurchaseDataSource,
} from '@/core/data/remote/FetchRemotePurchaseDataSource';

export class PurchaseRepositoryImpl implements PurchaseRepository {
  constructor(
    private readonly remoteDataSource: RemotePurchaseDataSource = remotePurchaseDataSource,
  ) {}

  getCurrentAccess(): Promise<Result<PurchaseAccess>> {
    return this.remoteDataSource.fetchCurrentAccess();
  }

  getFakeProducts(): Promise<Result<PurchaseProduct[]>> {
    return this.remoteDataSource.fetchFakeProducts();
  }

  getAppleAccountToken(): Promise<Result<string>> {
    return this.remoteDataSource.fetchAppleAccountToken();
  }

  simulateFakePurchase(input: {
    productId: string;
    scenario: FakePurchaseScenario;
  }): Promise<Result<PurchaseSimulationResult>> {
    return this.remoteDataSource.simulateFakePurchase(input);
  }

  verifyApplePurchase(input: ApplePurchaseVerificationInput): Promise<Result<PurchaseAccess>> {
    return this.remoteDataSource.verifyApplePurchase(input);
  }
}

export const purchaseRepository = new PurchaseRepositoryImpl();
