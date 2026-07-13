import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { DatabaseService } from "../src/database/database.service";
import type { FakePurchaseProvider } from "../src/purchases/fake-purchase.provider";
import { PurchaseApplicationService } from "../src/purchases/purchase-application.service";
import type { NormalizedPurchaseEvent } from "../src/purchases/purchase.types";

describe("PurchaseApplicationService Apple idempotency", () => {
  test("returns current access without writing a duplicate event", async () => {
    let transactionCalled = false;
    const service = createService({
      existingUserId: "user-1",
      onTransaction: () => {
        transactionCalled = true;
      },
    });

    const access = await service.applyEvent(appleEvent("user-1"));

    assert.equal(transactionCalled, false);
    assert.equal(access.planCode, "demo");
  });

  test("rejects a duplicate Apple event owned by another account", async () => {
    const service = createService({ existingUserId: "user-2" });

    await assert.rejects(service.applyEvent(appleEvent("user-1")), (error: unknown) => {
      if (!error || typeof error !== "object" || !("getResponse" in error)) return false;
      const response = (error as { getResponse(): unknown }).getResponse();
      return Boolean(
        response &&
          typeof response === "object" &&
          "code" in response &&
          response.code === "APPLE_PURCHASE_ALREADY_LINKED_TO_ANOTHER_ACCOUNT",
      );
    });
  });
});

function createService(input: { existingUserId: string; onTransaction?: () => void }) {
  const database = {
    $transaction: async () => input.onTransaction?.(),
    purchaseAccess: { findUnique: async () => null },
    purchaseEvent: {
      findUnique: async () => ({ userId: input.existingUserId }),
    },
  } as unknown as DatabaseService;
  return new PurchaseApplicationService(database, {} as FakePurchaseProvider);
}

function appleEvent(userId: string): NormalizedPurchaseEvent {
  return {
    environment: "sandbox",
    eventType: "PURCHASED",
    idempotencyKey: "apple:verify:transaction-1:1:renew-on:not-revoked:expiry",
    originalTransactionId: "original-transaction-1",
    provider: "apple",
    providerProductId: "trailbook_premium_monthly",
    rawPayload: {},
    result: "success",
    transactionId: "transaction-1",
    userId,
  };
}
