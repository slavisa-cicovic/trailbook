import type { Result } from '@/core/common/result';
import type {
  FakePurchaseScenario,
  ApplePurchaseVerificationInput,
  GooglePurchaseVerificationInput,
  PurchaseAccess,
  LocalTestTripAllowance,
  PurchaseProduct,
  PurchaseSimulationResult,
} from '@/core/domain/model/purchase';
import { apiGet, apiPost } from './apiClient';

export interface RemotePurchaseDataSource {
  fetchAppleAccountToken(): Promise<Result<string>>;
  fetchGoogleAccountId(): Promise<Result<string>>;
  fetchCurrentAccess(): Promise<Result<PurchaseAccess>>;
  fetchFakeProducts(): Promise<Result<PurchaseProduct[]>>;
  simulateFakePurchase(input: {
    productId: string;
    scenario: FakePurchaseScenario;
  }): Promise<Result<PurchaseSimulationResult>>;
  verifyApplePurchase(input: ApplePurchaseVerificationInput): Promise<Result<PurchaseAccess>>;
  verifyGooglePurchase(input: GooglePurchaseVerificationInput): Promise<Result<PurchaseAccess>>;
  fetchLocalTestTripAllowance(): Promise<Result<LocalTestTripAllowance>>;
  consumeLocalTestTripAllowance(clientTripId: string): Promise<Result<LocalTestTripAllowance>>;
}

class FetchRemotePurchaseDataSource implements RemotePurchaseDataSource {
  async fetchAppleAccountToken(): Promise<Result<string>> {
    const result = await apiGet<{ appAccountToken: string }>('/purchases/apple/account-token');
    return result.ok ? { ok: true, value: result.value.appAccountToken } : result;
  }

  async fetchGoogleAccountId(): Promise<Result<string>> {
    const result = await apiGet<{ obfuscatedAccountId: string }>(
      '/purchases/google/account-id',
    );
    return result.ok ? { ok: true, value: result.value.obfuscatedAccountId } : result;
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

  verifyGooglePurchase(input: GooglePurchaseVerificationInput): Promise<Result<PurchaseAccess>> {
    return apiPost<PurchaseAccess>('/purchases/google/verify', input);
  }

  fetchLocalTestTripAllowance(): Promise<Result<LocalTestTripAllowance>> {
    return apiGet<LocalTestTripAllowance>('/purchases/local-test-trip');
  }

  consumeLocalTestTripAllowance(
    clientTripId: string,
  ): Promise<Result<LocalTestTripAllowance>> {
    return apiPost<LocalTestTripAllowance>('/purchases/local-test-trip/consume', {
      clientTripId,
    });
  }
}

export const remotePurchaseDataSource: RemotePurchaseDataSource =
  new FetchRemotePurchaseDataSource();
