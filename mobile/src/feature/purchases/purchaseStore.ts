import { create } from 'zustand';
import { purchaseRepository } from '@/core/data/repository/PurchaseRepositoryImpl';
import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
} from '@/core/domain/model/purchase';

interface PurchaseState {
  access: PurchaseAccess | null;
  busyAction: string | null;
  message: string | null;
  products: PurchaseProduct[];
  load(): Promise<void>;
  refreshAccess(): Promise<void>;
  runScenario(actionKey: string, productId: string, scenario: FakePurchaseScenario): Promise<void>;
  clearMessage(): void;
  setAccess(access: PurchaseAccess): void;
  setBusyAction(action: string | null): void;
  setMessage(message: string | null): void;
  setProducts(products: PurchaseProduct[]): void;
}

export const usePurchaseStore = create<PurchaseState>((set) => ({
  access: null,
  busyAction: null,
  message: null,
  products: [],

  async refreshAccess() {
    set({ busyAction: 'access' });
    const result = await purchaseRepository.getCurrentAccess();
    if (!result.ok) {
      set({ busyAction: null });
      return;
    }
    set({ access: result.value, busyAction: null });
  },

  async load() {
    set({ busyAction: 'refresh', message: null });
    const [accessResult, productsResult] = await Promise.all([
      purchaseRepository.getCurrentAccess(),
      purchaseRepository.getFakeProducts(),
    ]);

    if (!accessResult.ok) {
      set({ busyAction: null, message: accessResult.error });
      return;
    }
    if (!productsResult.ok) {
      set({ access: accessResult.value, busyAction: null, message: productsResult.error });
      return;
    }

    set({
      access: accessResult.value,
      busyAction: null,
      message: 'Purchase access refreshed.',
      products: productsResult.value,
    });
  },

  async runScenario(actionKey, productId, scenario) {
    set({ busyAction: actionKey, message: null });
    const result = await purchaseRepository.simulateFakePurchase({ productId, scenario });
    if (!result.ok) {
      set({ busyAction: null, message: result.error });
      return;
    }

    const { purchaseResult, ...access } = result.value;
    set({
      access,
      busyAction: null,
      message: `Scenario ${scenario}: ${purchaseResult}.`,
    });
  },

  clearMessage() {
    set({ message: null });
  },

  setAccess(access) {
    set({ access });
  },

  setBusyAction(busyAction) {
    set({ busyAction });
  },

  setMessage(message) {
    set({ message });
  },

  setProducts(products) {
    set({ products });
  },
}));
