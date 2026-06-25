import { apiGet, apiPost } from '@/core/data/remote/apiClient';
import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
  PurchaseSimulationResult,
} from './purchase.types';

export function getPurchaseAccess() {
  return apiGet<PurchaseAccess>('/purchases/me');
}

export function listFakePurchaseProducts() {
  return apiGet<PurchaseProduct[]>('/purchases/products?provider=fake');
}

export function simulateFakePurchase(input: {
  productId: string;
  scenario: FakePurchaseScenario;
}) {
  return apiPost<PurchaseSimulationResult>('/purchases/fake/simulate', {
    providerProductId: input.productId,
    scenario: input.scenario,
  });
}
