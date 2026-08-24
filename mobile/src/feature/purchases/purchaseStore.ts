import { create } from 'zustand';
import { purchaseRepository } from '@/core/data/repository/PurchaseRepositoryImpl';
import type {
  FakePurchaseScenario,
  PurchaseAccess,
  PurchaseProduct,
} from '@/core/domain/model/purchase';
import { useAuthStore } from '@/feature/auth/authStore';
import {
  clearPurchaseAccessCache,
  loadPurchaseAccessCache,
  savePurchaseAccessCache,
} from './purchaseAccessCache';

interface PurchaseState {
  access: PurchaseAccess | null;
  busyAction: string | null;
  message: string | null;
  products: PurchaseProduct[];
  verifiedAt: string | null;
  hydrateAccess(userId: string | null): Promise<void>;
  load(): Promise<void>;
  refreshAccess(options?: { silent?: boolean }): Promise<void>;
  runScenario(actionKey: string, productId: string, scenario: FakePurchaseScenario): Promise<void>;
  clearMessage(): void;
  setAccess(access: PurchaseAccess, expectedUserId: string): void;
  setBusyAction(action: string | null): void;
  setMessage(message: string | null): void;
  setProducts(products: PurchaseProduct[]): void;
}

export const usePurchaseStore = create<PurchaseState>((set) => ({
  access: null,
  busyAction: null,
  message: null,
  products: [],
  verifiedAt: null,

  async hydrateAccess(userId) {
    set({ access: null, verifiedAt: null });
    if (!userId) {
      await clearPurchaseAccessCache();
      return;
    }
    const cached = await loadPurchaseAccessCache(userId);
    if (useAuthStore.getState().userId !== userId) return;
    set({
      access: cached?.access ?? null,
      verifiedAt: cached?.verifiedAt ?? null,
    });
  },

  async refreshAccess(options) {
    const requestedUserId = useAuthStore.getState().userId;
    if (!requestedUserId) return;
    if (!options?.silent) set({ busyAction: 'access' });
    const result = await purchaseRepository.getCurrentAccess();
    if (useAuthStore.getState().userId !== requestedUserId) return;
    if (!result.ok) {
      if (!options?.silent) set({ busyAction: null });
      return;
    }
    const verifiedAt = new Date().toISOString();
    set(options?.silent
      ? { access: result.value, verifiedAt }
      : { access: result.value, busyAction: null, verifiedAt });
    await savePurchaseAccessCache({
      access: result.value,
      userId: requestedUserId,
      verifiedAt,
    });
  },

  async load() {
    const requestedUserId = useAuthStore.getState().userId;
    if (!requestedUserId) return;
    set({ busyAction: 'refresh', message: null });
    const [accessResult, productsResult] = await Promise.all([
      purchaseRepository.getCurrentAccess(),
      purchaseRepository.getFakeProducts(),
    ]);
    if (useAuthStore.getState().userId !== requestedUserId) return;

    if (!accessResult.ok) {
      set({ busyAction: null, message: accessResult.error });
      return;
    }
    if (!productsResult.ok) {
      set({ access: accessResult.value, busyAction: null, message: productsResult.error });
      return;
    }

    const verifiedAt = new Date().toISOString();
    set({
      access: accessResult.value,
      busyAction: null,
      message: 'Purchase access refreshed.',
      products: productsResult.value,
      verifiedAt,
    });
    await savePurchaseAccessCache({
      access: accessResult.value,
      userId: requestedUserId,
      verifiedAt,
    });
  },

  async runScenario(actionKey, productId, scenario) {
    const requestedUserId = useAuthStore.getState().userId;
    if (!requestedUserId) return;
    set({ busyAction: actionKey, message: null });
    const result = await purchaseRepository.simulateFakePurchase({ productId, scenario });
    if (useAuthStore.getState().userId !== requestedUserId) return;
    if (!result.ok) {
      set({ busyAction: null, message: result.error });
      return;
    }

    const { purchaseResult, ...access } = result.value;
    const verifiedAt = new Date().toISOString();
    set({
      access,
      busyAction: null,
      message: `Scenario ${scenario}: ${purchaseResult}.`,
      verifiedAt,
    });
    void savePurchaseAccessCache({ access, userId: requestedUserId, verifiedAt });
  },

  clearMessage() {
    set({ message: null });
  },

  setAccess(access, expectedUserId) {
    if (useAuthStore.getState().userId !== expectedUserId) return;
    const verifiedAt = new Date().toISOString();
    set({ access, verifiedAt });
    void savePurchaseAccessCache({ access, userId: expectedUserId, verifiedAt });
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
