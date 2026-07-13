import type { Result } from '@/core/common/result';
import type {
  FakePurchaseScenario,
  ApplePurchaseVerificationInput,
  PurchaseAccess,
  PurchaseProduct,
  PurchaseSimulationResult,
} from '@/core/domain/model/purchase';
import { apiGet, apiPost } from './apiClient';

export interface RemotePurchaseDataSource {
  fetchAppleAccountToken(): Promise<Result<string>>;
  fetchCurrentAccess(): Promise<Result<PurchaseAccess>>;
  fetchFakeProducts(): Promise<Result<PurchaseProduct[]>>;
  simulateFakePurchase(input: {
    productId: string;
    scenario: FakePurchaseScenario;
  }): Promise<Result<PurchaseSimulationResult>>;
  verifyApplePurchase(input: ApplePurchaseVerificationInput): Promise<Result<PurchaseAccess>>;
}

class FetchRemotePurchaseDataSource implements RemotePurchaseDataSource {
  async fetchAppleAccountToken(): Promise<Result<string>> {
    const result = await apiGet<{ appAccountToken: string }>('/purchases/apple/account-token');
    return result.ok ? { ok: true, value: result.value.appAccountToken } : result;
  }

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

  verifyApplePurchase(input: ApplePurchaseVerificationInput): Promise<Result<PurchaseAccess>> {
    return apiPost<PurchaseAccess>('/purchases/apple/verify', input);
  }
}

export const remotePurchaseDataSource: RemotePurchaseDataSource =
  new FetchRemotePurchaseDataSource();
