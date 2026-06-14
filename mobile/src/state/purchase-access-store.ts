import { create } from "zustand";

import type { AuthenticatedDeviceSession } from "../domain/identity";
import type { EntitlementCode, PurchaseAccess } from "../domain/purchases";
import { getPurchaseAccess } from "../services/purchases/purchase-api.service";

interface PurchaseAccessState {
  access: PurchaseAccess | null;
  lastError: string | null;
  lastRefreshedAt: string | null;
  loading: boolean;
}

export const usePurchaseAccessStore = create<PurchaseAccessState>(() => ({
  access: null,
  lastError: null,
  lastRefreshedAt: null,
  loading: false,
}));

let refreshInFlight: Promise<PurchaseAccess | null> | null = null;

export function getPurchaseAccessSnapshot(): PurchaseAccessState {
  return usePurchaseAccessStore.getState();
}

export function hasPurchaseEntitlement(
  access: PurchaseAccess | null,
  entitlementCode: EntitlementCode,
): boolean {
  return access?.entitlements.includes(entitlementCode) ?? false;
}

export function clearPurchaseAccess(): void {
  usePurchaseAccessStore.setState({
    access: null,
    lastError: null,
    lastRefreshedAt: null,
    loading: false,
  });
}

export function setPurchaseAccess(access: PurchaseAccess): void {
  usePurchaseAccessStore.setState({
    access,
    lastError: null,
    lastRefreshedAt: new Date().toISOString(),
    loading: false,
  });
}

export async function refreshPurchaseAccessForSession(
  identitySession: AuthenticatedDeviceSession | null,
): Promise<PurchaseAccess | null> {
  if (
    !identitySession ||
    identitySession.mode !== "authenticated" ||
    !identitySession.sessionToken
  ) {
    clearPurchaseAccess();
    return null;
  }

  const sessionToken = identitySession.sessionToken;

  if (refreshInFlight) {
    return refreshInFlight;
  }

  usePurchaseAccessStore.setState({ loading: true, lastError: null });

  refreshInFlight = (async () => {
    try {
      const access = await getPurchaseAccess(sessionToken);

      usePurchaseAccessStore.setState({
        access,
        lastError: null,
        lastRefreshedAt: new Date().toISOString(),
        loading: false,
      });

      return access;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh purchase access.";

      usePurchaseAccessStore.setState({
        access: null,
        lastError: message,
        lastRefreshedAt: new Date().toISOString(),
        loading: false,
      });

      if (__DEV__) {
        console.warn("[Trailbook][purchase-access] refresh failed", message);
      }

      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
