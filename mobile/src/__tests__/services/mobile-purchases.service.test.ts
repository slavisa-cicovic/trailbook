import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedDeviceSession } from "../../domain/identity";
import { API_ROUTES } from "../../constants/api-routes";
import {
  getPurchaseAccess,
  listPurchaseProducts,
  simulateFakePurchase,
} from "../../services/purchases/purchase-api.service";
import { FakeMobilePurchaseProvider } from "../../services/purchases/fake-mobile-purchase.provider";
import { ReadOnlyMobilePurchaseProvider } from "../../services/purchases/read-only-mobile-purchase.provider";
import {
  getMobilePurchaseProvider,
  isFakePurchaseProviderEnabled,
} from "../../services/purchases/mobile-purchase-provider-resolver";
import { requestFromBackend } from "../../services/api/mobile-api.service";

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
});

describe("mobile purchase provider resolver", () => {
  const originalFakePurchasesFlag = process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES = "true";
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES = originalFakePurchasesFlag;
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
});
