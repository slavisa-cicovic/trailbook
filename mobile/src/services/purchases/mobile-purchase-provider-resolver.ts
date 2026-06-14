import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { MobilePurchaseProvider } from "./mobile-purchase-provider";
import { FakeMobilePurchaseProvider } from "./fake-mobile-purchase.provider";
import { ReadOnlyMobilePurchaseProvider } from "./read-only-mobile-purchase.provider";

export function isFakePurchaseProviderEnabled(session: AuthenticatedDeviceSession | null): boolean {
  if (!session || session.mode !== "authenticated" || !session.sessionToken) {
    return false;
  }

  const roleAllowsFake = session.role === "test_user" || session.role === "admin";
  const environmentAllowsFake =
    __DEV__ || process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES === "true";

  return roleAllowsFake && environmentAllowsFake;
}

export function getMobilePurchaseProvider(session: AuthenticatedDeviceSession | null): MobilePurchaseProvider {
  if (isFakePurchaseProviderEnabled(session) && session?.sessionToken) {
    return new FakeMobilePurchaseProvider(session.sessionToken);
  }

  return new ReadOnlyMobilePurchaseProvider(session?.sessionToken ?? null);
}
