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

  test("accepts the same Apple transaction received through another channel", async () => {
    let transactionCalled = false;
    const service = createService({
      existingTransactionUserId: "user-1",
      onTransaction: () => {
        transactionCalled = true;
      },
    });

    const access = await service.applyEvent(appleEvent("user-1"));

    assert.equal(transactionCalled, false);
    assert.equal(access.planCode, "demo");
  });

  test("rejects the same Apple transaction for another account", async () => {
    const service = createService({ existingTransactionUserId: "user-2" });

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

describe("PurchaseApplicationService local test trip allowance", () => {
  test("returns an unused allowance", async () => {
    const { service } = createAllowanceService();

    const allowance = await service.getLocalTestTripAllowance("user-1");

    assert.deepEqual(allowance, {
      available: true,
      tripClientId: null,
      usedAt: null,
    });
  });

  test("atomically consumes the allowance", async () => {
    const { service } = createAllowanceService();

    const allowance = await service.consumeLocalTestTripAllowance("user-1", "trip-1");

    assert.equal(allowance.available, false);
    assert.equal(allowance.tripClientId, "trip-1");
    assert.ok(allowance.usedAt);
  });

  test("is idempotent for the same trip", async () => {
    const { service } = createAllowanceService();
    const first = await service.consumeLocalTestTripAllowance("user-1", "trip-1");

    const second = await service.consumeLocalTestTripAllowance("user-1", "trip-1");

    assert.deepEqual(second, first);
  });

  test("rejects a different trip after the allowance is used", async () => {
    const { service } = createAllowanceService();
    await service.consumeLocalTestTripAllowance("user-1", "trip-1");

    await assert.rejects(
      service.consumeLocalTestTripAllowance("user-1", "trip-2"),
      (error: unknown) => {
        if (!error || typeof error !== "object" || !("getResponse" in error)) return false;
        const response = (error as { getResponse(): unknown }).getResponse();
        return Boolean(
          response &&
            typeof response === "object" &&
            "code" in response &&
            response.code === "LOCAL_TEST_TRIP_ALREADY_USED",
        );
      },
    );
  });
});

function createService(input: {
  existingTransactionUserId?: string;
  existingUserId?: string;
  onTransaction?: () => void;
}) {
  const database = {
    $transaction: async () => input.onTransaction?.(),
    purchaseAccess: { findUnique: async () => null },
    purchaseEvent: {
      findFirst: async (query: { where: { transactionId?: string } }) =>
        query.where.transactionId && input.existingTransactionUserId
          ? { userId: input.existingTransactionUserId }
          : null,
      findUnique: async () =>
        input.existingUserId ? { userId: input.existingUserId } : null,
    },
  } as unknown as DatabaseService;
  return new PurchaseApplicationService(database, {} as FakePurchaseProvider);
}

function createAllowanceService() {
  const user = {
    localTestTripClientId: null as string | null,
    localTestTripUsedAt: null as Date | null,
  };
  const database = {
    user: {
      findUniqueOrThrow: async () => ({ ...user }),
      updateMany: async (query: {
        data: { localTestTripClientId: string; localTestTripUsedAt: Date };
      }) => {
        if (user.localTestTripUsedAt) return { count: 0 };
        user.localTestTripClientId = query.data.localTestTripClientId;
        user.localTestTripUsedAt = query.data.localTestTripUsedAt;
        return { count: 1 };
      },
    },
  } as unknown as DatabaseService;
  return {
    service: new PurchaseApplicationService(database, {} as FakePurchaseProvider),
  };
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
