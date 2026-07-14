import * as SecureStore from 'expo-secure-store';

import type { PurchaseAccess } from '@/core/domain/model/purchase';

const CACHE_KEY = 'trailbook.purchase_access.v1';

export interface CachedPurchaseAccess {
  access: PurchaseAccess;
  userId: string;
  verifiedAt: string;
}

export async function loadPurchaseAccessCache(
  userId: string,
): Promise<CachedPurchaseAccess | null> {
  const raw = await SecureStore.getItemAsync(CACHE_KEY);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as CachedPurchaseAccess;
    return cached.userId === userId ? cached : null;
  } catch {
    await SecureStore.deleteItemAsync(CACHE_KEY);
    return null;
  }
}

export async function savePurchaseAccessCache(
  cached: CachedPurchaseAccess,
): Promise<void> {
  await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(cached));
}

export async function clearPurchaseAccessCache(): Promise<void> {
  await SecureStore.deleteItemAsync(CACHE_KEY);
}
