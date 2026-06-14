import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { normalizeAppleTransactionPayload } from "../src/purchases/apple-purchase.provider";

describe("ApplePurchaseProvider", () => {
  test("normalizes active sandbox transaction payload into purchase event", () => {
    const event = normalizeAppleTransactionPayload({
      fallbackProductId: "trailbook_premium_monthly",
      payload: {
        environment: "Sandbox",
        expiresDate: String(Date.parse("2099-08-01T00:00:00.000Z")),
        originalTransactionId: "apple-original-1",
        productId: "trailbook_premium_monthly",
        purchaseDate: String(Date.parse("2026-07-01T00:00:00.000Z")),
        transactionId: "apple-transaction-1",
      },
      userId: "user-1",
    });

    assert.equal(event.environment, "sandbox");
    assert.equal(event.eventType, "PURCHASED");
    assert.equal(event.provider, "apple");
    assert.equal(event.providerOriginalTransactionId, "apple-original-1");
    assert.equal(event.providerProductId, "trailbook_premium_monthly");
    assert.equal(event.providerTransactionId, "apple-transaction-1");
    assert.equal(event.purchaseResult, "success");
    assert.equal(event.userId, "user-1");
  });

  test("normalizes revoked transaction payload into revoked event", () => {
    const event = normalizeAppleTransactionPayload({
      fallbackProductId: "trailbook_premium_monthly",
      payload: {
        environment: "Sandbox",
        originalTransactionId: "apple-original-1",
        productId: "trailbook_premium_monthly",
        purchaseDate: String(Date.parse("2026-07-01T00:00:00.000Z")),
        revocationDate: String(Date.parse("2026-07-02T00:00:00.000Z")),
        transactionId: "apple-transaction-1",
      },
      userId: "user-1",
    });

    assert.equal(event.eventType, "REVOKED");
    assert.equal(event.revokedAt, "2026-07-02T00:00:00.000Z");
  });
});
