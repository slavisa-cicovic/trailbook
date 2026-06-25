import { create } from 'zustand';
import {
  getPurchaseAccess,
  listFakePurchaseProducts,
  simulateFakePurchase,
} from './purchaseApi';
import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
} from './purchase.types';

interface PurchaseState {
  access: PurchaseAccess | null;
  busyAction: string | null;
  message: string | null;
  products: PurchaseProduct[];
  load(): Promise<void>;
  runScenario(actionKey: string, productId: string, scenario: FakePurchaseScenario): Promise<void>;
  clearMessage(): void;
}

export const usePurchaseStore = create<PurchaseState>((set) => ({
  access: null,
  busyAction: null,
  message: null,
  products: [],

  async load() {
    set({ busyAction: 'refresh', message: null });
    const [accessResult, productsResult] = await Promise.all([
      getPurchaseAccess(),
      listFakePurchaseProducts(),
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
    const result = await simulateFakePurchase({ productId, scenario });
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
}));
