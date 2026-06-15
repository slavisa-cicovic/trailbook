import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedDeviceSession } from "../../domain/identity";
import { API_ROUTES } from "../../constants/api-routes";
import {
  getPurchaseAccess,
  listPurchaseProducts,
  simulateFakePurchase,
  verifyPurchaseWithBackend,
} from "../../services/purchases/purchase-api.service";
import { AppleMobilePurchaseProvider } from "../../services/purchases/apple-mobile-purchase.provider";
import { FakeMobilePurchaseProvider } from "../../services/purchases/fake-mobile-purchase.provider";
import { GoogleMobilePurchaseProvider } from "../../services/purchases/google-mobile-purchase.provider";
import { ReadOnlyMobilePurchaseProvider } from "../../services/purchases/read-only-mobile-purchase.provider";
import {
  getMobilePurchaseProvider,
  isFakePurchaseProviderEnabled,
} from "../../services/purchases/mobile-purchase-provider-resolver";
import { requestFromBackend } from "../../services/api/mobile-api.service";
import {
  clearPurchaseAccess,
  getPurchaseAccessSnapshot,
  hasPurchaseEntitlement,
  refreshPurchaseAccessForSession,
  setPurchaseAccess,
} from "../../state/purchase-access-store";

vi.mock("../../services/api/mobile-api.service", () => ({
  requestFromBackend: vi.fn(),
}));

const session: AuthenticatedDeviceSession = {
  deviceId: "device-1",
  displayName: "Test User",
  mode: "authenticated",
  providers: ["local"],
  refreshExpiresAt: "2026-06-01T00:00:00.000Z",
  refreshToken: "refresh-token",
  role: "test_user",
  sessionExpiresAt: "2026-06-01T00:00:00.000Z",
  sessionToken: "session-token",
  signedInAt: "2026-05-01T00:00:00.000Z",
  userEmail: "test@example.com",
  userId: "user-1",
};

describe("purchase API service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPurchaseAccess();
  });

  it("lists fake purchase products through backend purchases endpoint", async () => {
    vi.mocked(requestFromBackend).mockResolvedValueOnce([]);

    await listPurchaseProducts("session-token");

    expect(requestFromBackend).toHaveBeenCalledWith(
      `${API_ROUTES.purchases.products}?provider=fake`,
      { method: "GET" },
      "session-token",
      expect.anything(),
    );
  });

  it("lists Apple products through backend purchases endpoint", async () => {
    vi.mocked(requestFromBackend).mockResolvedValueOnce([]);

    await listPurchaseProducts("session-token", "apple");

    expect(requestFromBackend).toHaveBeenCalledWith(
      `${API_ROUTES.purchases.products}?provider=apple`,
      { method: "GET" },
      "session-token",
      expect.anything(),
    );
  });

  it("lists Google products through backend purchases endpoint", async () => {
    vi.mocked(requestFromBackend).mockResolvedValueOnce([]);

    await listPurchaseProducts("session-token", "google");

    expect(requestFromBackend).toHaveBeenCalledWith(
      `${API_ROUTES.purchases.products}?provider=google`,
      { method: "GET" },
      "session-token",
      expect.anything(),
    );
  });

  it("refreshes purchase access through /purchases/me", async () => {
    vi.mocked(requestFromBackend).mockResolvedValueOnce({
      currentPeriodEndsAt: null,
      entitlements: [],
      planCode: "demo",
      subscriptionStatus: "active",
    });

    await getPurchaseAccess("session-token");

    expect(requestFromBackend).toHaveBeenCalledWith(
      API_ROUTES.purchases.me,
      { method: "GET" },
      "session-token",
      expect.anything(),
    );
  });

  it("simulates fake purchase through backend fake endpoint", async () => {
    vi.mocked(requestFromBackend).mockResolvedValueOnce({
      currentPeriodEndsAt: "2026-07-01T00:00:00.000Z",
      entitlements: ["sync"],
      planCode: "premium_monthly",
      purchaseResult: "success",
      subscriptionStatus: "active",
    });

    await simulateFakePurchase("session-token", {
      productId: "trailbook_premium_monthly",
      scenario: "success",
    });

    expect(requestFromBackend).toHaveBeenCalledWith(
      API_ROUTES.purchases.fakeSimulate,
      {
        method: "POST",
        body: JSON.stringify({
          providerProductId: "trailbook_premium_monthly",
          scenario: "success",
        }),
      },
      "session-token",
      expect.anything(),
    );
  });

  it("verifies Apple transaction through provider-neutral backend endpoint", async () => {
    vi.mocked(requestFromBackend).mockResolvedValueOnce({
      currentPeriodEndsAt: "2026-07-01T00:00:00.000Z",
      entitlements: ["sync"],
      planCode: "premium_monthly",
      purchaseResult: "success",
      subscriptionStatus: "active",
    });

    await verifyPurchaseWithBackend("session-token", {
      productId: "trailbook_premium_monthly",
      provider: "apple",
      transactionId: "apple-transaction-1",
    });

    expect(requestFromBackend).toHaveBeenCalledWith(
      API_ROUTES.purchases.verify,
      {
        method: "POST",
        body: JSON.stringify({
          productId: "trailbook_premium_monthly",
          provider: "apple",
          transactionId: "apple-transaction-1",
        }),
      },
      "session-token",
      expect.anything(),
    );
  });

  it("verifies Google purchase token through provider-neutral backend endpoint", async () => {
    vi.mocked(requestFromBackend).mockResolvedValueOnce({
      currentPeriodEndsAt: "2026-07-01T00:00:00.000Z",
      entitlements: ["sync"],
      planCode: "premium_monthly",
      purchaseResult: "success",
      subscriptionStatus: "active",
    });

    await verifyPurchaseWithBackend("session-token", {
      productId: "trailbook_premium_monthly",
      provider: "google",
      purchaseToken: "google-purchase-token-1",
    });

    expect(requestFromBackend).toHaveBeenCalledWith(
      API_ROUTES.purchases.verify,
      {
        method: "POST",
        body: JSON.stringify({
          productId: "trailbook_premium_monthly",
          provider: "google",
          purchaseToken: "google-purchase-token-1",
        }),
      },
      "session-token",
      expect.anything(),
    );
  });
});

describe("purchase access store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPurchaseAccess();
  });

  it("refreshes entitlement snapshot from backend for authenticated sessions", async () => {
    vi.mocked(requestFromBackend).mockResolvedValueOnce({
      currentPeriodEndsAt: null,
      entitlements: ["sync", "sharing"],
      planCode: "premium_lifetime",
      subscriptionStatus: "lifetime",
    });

    const access = await refreshPurchaseAccessForSession(session);

    expect(access?.entitlements).toEqual(["sync", "sharing"]);
    expect(hasPurchaseEntitlement(getPurchaseAccessSnapshot().access, "sync")).toBe(true);
    expect(hasPurchaseEntitlement(getPurchaseAccessSnapshot().access, "photo_storage")).toBe(false);
  });

  it("clears entitlement snapshot when session is not authenticated", async () => {
    setPurchaseAccess({
      currentPeriodEndsAt: null,
      entitlements: ["sync"],
      planCode: "premium_lifetime",
      subscriptionStatus: "lifetime",
    });

    await refreshPurchaseAccessForSession(null);

    expect(getPurchaseAccessSnapshot().access).toBeNull();
  });
});

describe("mobile purchase provider resolver", () => {
  const originalFakePurchasesFlag = process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES;
  const originalPurchaseProvider = process.env.EXPO_PUBLIC_PURCHASE_PROVIDER;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES = "true";
    process.env.EXPO_PUBLIC_PURCHASE_PROVIDER = "";
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES = originalFakePurchasesFlag;
    process.env.EXPO_PUBLIC_PURCHASE_PROVIDER = originalPurchaseProvider;
  });

  it("returns fake provider for authenticated test user when fake purchases are enabled", () => {
    expect(isFakePurchaseProviderEnabled(session)).toBe(true);
    expect(getMobilePurchaseProvider(session)).toBeInstanceOf(FakeMobilePurchaseProvider);
  });

  it("does not expose fake provider to normal production user", () => {
    const normalSession: AuthenticatedDeviceSession = {
      ...session,
      role: "user",
    };

    expect(isFakePurchaseProviderEnabled(normalSession)).toBe(false);
    expect(getMobilePurchaseProvider(normalSession)).toBeInstanceOf(ReadOnlyMobilePurchaseProvider);
  });

  it("does not expose fake provider without session token", () => {
    const tokenlessSession: AuthenticatedDeviceSession = {
      ...session,
      sessionToken: null,
    };

    expect(isFakePurchaseProviderEnabled(tokenlessSession)).toBe(false);
    expect(getMobilePurchaseProvider(tokenlessSession)).toBeInstanceOf(ReadOnlyMobilePurchaseProvider);
  });

  it("returns Apple provider when explicitly configured", () => {
    process.env.EXPO_PUBLIC_PURCHASE_PROVIDER = "apple";

    expect(getMobilePurchaseProvider(session)).toBeInstanceOf(AppleMobilePurchaseProvider);
  });

  it("returns Google provider when explicitly configured", () => {
    process.env.EXPO_PUBLIC_PURCHASE_PROVIDER = "google";

    expect(getMobilePurchaseProvider(session)).toBeInstanceOf(GoogleMobilePurchaseProvider);
  });
});
