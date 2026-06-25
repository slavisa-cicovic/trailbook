import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { FakePurchaseProvider } from "../src/purchases/fake-purchase.provider";

describe("FakePurchaseProvider", () => {
  test("creates an active monthly purchase event", () => {
    const provider = new FakePurchaseProvider();
    const event = provider.completePurchase({
      productId: "trailbook_premium_monthly",
      scenario: "success",
      transactionId: "transaction-1",
      userId: "user-1",
    });

    assert.ok(event);
    assert.equal(event.eventType, "PURCHASED");
    assert.equal(event.provider, "fake");
    assert.equal(event.result, "success");
    assert.equal(event.transactionId, "transaction-1");
    assert.ok(event.expiresAt);
  });

  test("canceling checkout produces no purchase event", () => {
    const provider = new FakePurchaseProvider();
    const event = provider.completePurchase({
      productId: "trailbook_premium_monthly",
      scenario: "cancel",
      userId: "user-1",
    });

    assert.equal(event, null);
  });

  test("refund creates a revocation event", () => {
    const provider = new FakePurchaseProvider();
    const event = provider.completePurchase({
      productId: "trailbook_premium_yearly",
      scenario: "refund",
      transactionId: "transaction-2",
      userId: "user-1",
    });

    assert.ok(event);
    assert.equal(event.eventType, "REFUNDED");
    assert.ok(event.revokedAt);
  });

  test("pending does not report a successful purchase", () => {
    const provider = new FakePurchaseProvider();
    const event = provider.completePurchase({
      productId: "trailbook_lifetime",
      scenario: "pending",
      transactionId: "transaction-3",
      userId: "user-1",
    });

    assert.ok(event);
    assert.equal(event.eventType, "PENDING");
    assert.equal(event.result, "pending");
  });
});
