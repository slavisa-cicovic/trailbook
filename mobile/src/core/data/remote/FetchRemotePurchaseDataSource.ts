import type { Result } from '@/core/common/result';
import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
  PurchaseSimulationResult,
} from '@/core/domain/model/purchase';
import { apiGet, apiPost } from './apiClient';

export interface RemotePurchaseDataSource {
  fetchCurrentAccess(): Promise<Result<PurchaseAccess>>;
  fetchFakeProducts(): Promise<Result<PurchaseProduct[]>>;
  simulateFakePurchase(input: {
    productId: string;
    scenario: FakePurchaseScenario;
  }): Promise<Result<PurchaseSimulationResult>>;
}

class FetchRemotePurchaseDataSource implements RemotePurchaseDataSource {
  fetchCurrentAccess(): Promise<Result<PurchaseAccess>> {
    return apiGet<PurchaseAccess>('/purchases/me');
  }

  fetchFakeProducts(): Promise<Result<PurchaseProduct[]>> {
    return apiGet<PurchaseProduct[]>('/purchases/products?provider=fake');
  }

  simulateFakePurchase(input: {
    productId: string;
    scenario: FakePurchaseScenario;
  }): Promise<Result<PurchaseSimulationResult>> {
    return apiPost<PurchaseSimulationResult>('/purchases/fake/simulate', {
      providerProductId: input.productId,
      scenario: input.scenario,
    });
  }
}

export const remotePurchaseDataSource: RemotePurchaseDataSource =
  new FetchRemotePurchaseDataSource();
