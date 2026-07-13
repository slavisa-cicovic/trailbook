import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AutoRenewStatus,
  Environment,
  Status,
  TransactionReason,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

import type { DatabaseService } from "../src/database/database.service";
import { ApplePurchaseProvider } from "../src/purchases/apple-purchase.provider";
import type { ApplePurchaseConfig } from "../src/purchases/apple-purchase.config";
import type {
  AppleStoreGateway,
  VerifiedAppleSubscription,
} from "../src/purchases/apple-store.gateway";
import type { PurchaseApplicationService } from "../src/purchases/purchase-application.service";
import type { NormalizedPurchaseEvent } from "../src/purchases/purchase.types";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_TOKEN = "20000000-0000-4000-8000-000000000002";
const MONTHLY_PRODUCT = "trailbook_premium_monthly";

describe("ApplePurchaseProvider", () => {
  test("normalizes an active verified Apple subscription", async () => {
    const harness = createHarness(createVerifiedSubscription());

    await harness.provider.verifyPurchase(validInput());

    assert.equal(harness.events.length, 1);
    assert.equal(harness.events[0].eventType, "PURCHASED");
    assert.equal(harness.events[0].subscriptionStatus, "active");
    assert.equal(harness.events[0].provider, "apple");
    assert.ok(harness.events[0].expiresAt);
  });

  test("normalizes expired and revoked subscriptions without active status", async () => {
    const expired = createHarness(createVerifiedSubscription({ status: Status.EXPIRED }));
    await expired.provider.verifyPurchase(validInput());
    assert.equal(expired.events[0].eventType, "EXPIRED");
    assert.equal(expired.events[0].subscriptionStatus, "expired");

    const revoked = createHarness(
      createVerifiedSubscription({ revocationDate: Date.now(), status: Status.REVOKED }),
    );
    await revoked.provider.verifyPurchase(validInput());
    assert.equal(revoked.events[0].eventType, "REVOKED");
    assert.equal(revoked.events[0].subscriptionStatus, "revoked");
  });

  test("preserves access during a verified billing grace period", async () => {
    const gracePeriodExpiresDate = Date.now() + 60_000;
    const harness = createHarness(
      createVerifiedSubscription({ gracePeriodExpiresDate, status: Status.BILLING_GRACE_PERIOD }),
    );

    await harness.provider.verifyPurchase(validInput());

    assert.equal(harness.events[0].subscriptionStatus, "in_grace_period");
    assert.equal(harness.events[0].expiresAt, new Date(gracePeriodExpiresDate).toISOString());
  });

  test("rejects account token, bundle and product mismatches", async () => {
    const tokenHarness = createHarness(createVerifiedSubscription());
    await assertDomainError(
      tokenHarness.provider.verifyPurchase({
        ...validInput(),
        appAccountToken: "30000000-0000-4000-8000-000000000003",
      }),
      "APPLE_ACCOUNT_TOKEN_MISMATCH",
    );

    const bundleHarness = createHarness(
      createVerifiedSubscription({ bundleId: "com.example.other" }),
    );
    await assertDomainError(
      bundleHarness.provider.verifyPurchase(validInput()),
      "APPLE_BUNDLE_MISMATCH",
    );

    const productHarness = createHarness(
      createVerifiedSubscription({ productId: "unknown_product" }),
    );
    await assertDomainError(
      productHarness.provider.verifyPurchase(validInput()),
      "APPLE_PRODUCT_NOT_ALLOWED",
    );
  });

  test("produces a stable idempotency key for duplicate verification", async () => {
    const harness = createHarness(createVerifiedSubscription());

    await harness.provider.verifyPurchase(validInput());
    await harness.provider.verifyPurchase(validInput());

    assert.equal(harness.events.length, 2);
    assert.equal(harness.events[0].idempotencyKey, harness.events[1].idempotencyKey);
  });
});

function createHarness(verified: VerifiedAppleSubscription) {
  const events: NormalizedPurchaseEvent[] = [];
  const database = {
    user: {
      findUnique: async () => ({ appleAppAccountToken: ACCOUNT_TOKEN }),
    },
  } as unknown as DatabaseService;
  const purchaseApplication = {
    applyEvent: async (event: NormalizedPurchaseEvent) => {
      events.push(event);
      return {
        currentPeriodEndsAt: event.expiresAt ?? null,
        entitlements: event.eventType === "EXPIRED" || event.eventType === "REVOKED" ? [] : ["sync"],
        planCode: "premium_monthly",
        subscriptionStatus: event.subscriptionStatus ?? "active",
      };
    },
  } as unknown as PurchaseApplicationService;
  const config = {
    bundleId: "com.slavisacicovic.trailbook",
    productIds: new Set([MONTHLY_PRODUCT, "trailbook_premium_yearly"]),
  } as ApplePurchaseConfig;
  const gateway = {
    getNotificationHistory: async () => [],
    requestTestNotification: async () => "test-token",
    verifyNotification: async () => {
      throw new Error("Not used by this test.");
    },
    verifySubscription: async () => verified,
  } satisfies AppleStoreGateway;

  return {
    events,
    provider: new ApplePurchaseProvider(database, purchaseApplication, config, gateway),
  };
}

function createVerifiedSubscription(
  overrides: {
    bundleId?: string;
    gracePeriodExpiresDate?: number;
    productId?: string;
    revocationDate?: number;
    status?: Status;
  } = {},
): VerifiedAppleSubscription {
  const transaction: JWSTransactionDecodedPayload = {
    appAccountToken: ACCOUNT_TOKEN,
    bundleId: overrides.bundleId ?? "com.slavisacicovic.trailbook",
    environment: Environment.SANDBOX,
    expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
    originalTransactionId: "original-transaction-1",
    productId: overrides.productId ?? MONTHLY_PRODUCT,
    purchaseDate: Date.now(),
    revocationDate: overrides.revocationDate,
    signedDate: Date.now(),
    transactionId: "transaction-1",
    transactionReason: TransactionReason.PURCHASE,
  };
  return {
    currentTransaction: transaction,
    environment: Environment.SANDBOX,
    rawStatusResponse: {},
    renewalInfo: {
      appAccountToken: ACCOUNT_TOKEN,
      autoRenewStatus: AutoRenewStatus.ON,
      gracePeriodExpiresDate: overrides.gracePeriodExpiresDate,
      originalTransactionId: "original-transaction-1",
      productId: overrides.productId ?? MONTHLY_PRODUCT,
    },
    requestedTransaction: transaction,
    status: overrides.status ?? Status.ACTIVE,
  };
}

function validInput() {
  return {
    appAccountToken: ACCOUNT_TOKEN,
    productId: MONTHLY_PRODUCT,
    transactionId: "transaction-1",
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
