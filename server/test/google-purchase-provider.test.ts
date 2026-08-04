import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { GooglePurchaseConfig } from "../src/purchases/google-purchase.config";
import { GooglePurchaseProvider } from "../src/purchases/google-purchase.provider";
import type {
  GooglePlayGateway,
  VerifiedGoogleSubscription,
} from "../src/purchases/google-play.gateway";
import type { PurchaseApplicationService } from "../src/purchases/purchase-application.service";
import type { NormalizedPurchaseEvent } from "../src/purchases/purchase.types";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "account-hash";
const PRODUCT_ID = "trailbook_premium";
const PURCHASE_TOKEN = "google-purchase-token";

describe("GooglePurchaseProvider", () => {
  test("persists and then acknowledges an active verified subscription", async () => {
    const harness = createHarness(subscription());

    await harness.provider.verifyPurchase(validInput());

    assert.equal(harness.events[0].provider, "google");
    assert.equal(harness.events[0].providerBasePlanId, "monthly");
    assert.equal(harness.events[0].eventType, "PURCHASED");
    assert.equal(harness.events[0].subscriptionStatus, "active");
    assert.deepEqual(harness.operations, ["persist", "acknowledge"]);
  });

  test("does not acknowledge or grant a pending purchase", async () => {
    const harness = createHarness(
      subscription({ state: "SUBSCRIPTION_STATE_PENDING" }),
    );

    await harness.provider.verifyPurchase(validInput());

    assert.equal(harness.events[0].eventType, "PENDING");
    assert.equal(harness.events[0].result, "pending");
    assert.deepEqual(harness.operations, ["persist"]);
  });

  test("normalizes grace, hold, cancellation and expiry", async () => {
    const cases = [
      ["SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "RESTORED", "in_grace_period"],
      ["SUBSCRIPTION_STATE_ON_HOLD", "EXPIRED", "billing_retry"],
      ["SUBSCRIPTION_STATE_CANCELED", "CANCELED", "canceled"],
      ["SUBSCRIPTION_STATE_EXPIRED", "EXPIRED", "expired"],
    ] as const;
    for (const [state, eventType, status] of cases) {
      const harness = createHarness(subscription({ state }));
      await harness.provider.verifyPurchase(validInput());
      assert.equal(harness.events[0].eventType, eventType);
      assert.equal(harness.events[0].subscriptionStatus, status);
    }
  });

  test("rejects account ownership and base-plan mismatches", async () => {
    const account = createHarness(subscription({ externalAccountId: "another-account" }));
    await assertDomainError(account.provider.verifyPurchase(validInput()), "GOOGLE_ACCOUNT_ID_MISMATCH");

    const plan = createHarness(subscription({ basePlanId: "yearly" }));
    await assertDomainError(plan.provider.verifyPurchase(validInput()), "GOOGLE_PRODUCT_NOT_ALLOWED");
  });
});

function createHarness(verified: VerifiedGoogleSubscription) {
  const events: NormalizedPurchaseEvent[] = [];
  const operations: string[] = [];
  const application = {
    applyEvent: async (event: NormalizedPurchaseEvent) => {
      events.push(event);
      operations.push("persist");
      return {
        currentPeriodEndsAt: event.expiresAt ?? null,
        entitlements: event.eventType === "PENDING" ? [] : ["sync"],
        planCode: "premium_monthly",
        subscriptionStatus: event.subscriptionStatus ?? "active",
      };
    },
  } as unknown as PurchaseApplicationService;
  const config = {
    accountId: () => ACCOUNT_ID,
    basePlanIds: new Set(["monthly", "yearly"]),
    productId: PRODUCT_ID,
  } as GooglePurchaseConfig;
  const gateway: GooglePlayGateway = {
    acknowledge: async () => { operations.push("acknowledge"); },
    verifySubscription: async () => verified,
  };
  return {
    events,
    operations,
    provider: new GooglePurchaseProvider(application, config, gateway),
  };
}

function subscription(
  overrides: {
    basePlanId?: string;
    externalAccountId?: string;
    state?: string;
  } = {},
): VerifiedGoogleSubscription {
  return {
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    externalAccountId: overrides.externalAccountId ?? ACCOUNT_ID,
    rawPayload: { source: "fixture" },
    state: overrides.state ?? "SUBSCRIPTION_STATE_ACTIVE",
    testPurchase: true,
    lineItems: [{
      autoRenewEnabled: true,
      basePlanId: overrides.basePlanId ?? "monthly",
      expiryTime: "2026-09-04T12:00:00Z",
      productId: PRODUCT_ID,
    }],
  };
}

function validInput() {
  return {
    basePlanId: "monthly",
    productId: PRODUCT_ID,
    purchaseToken: PURCHASE_TOKEN,
    userId: USER_ID,
  };
}

async function assertDomainError(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => {
    if (!error || typeof error !== "object" || !("getResponse" in error)) return false;
    const response = (error as { getResponse(): unknown }).getResponse();
    return Boolean(response && typeof response === "object" && "code" in response && response.code === code);
  });
}
