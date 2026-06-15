import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { normalizeGooglePurchasePayload } from "../src/purchases/google-purchase.provider";

describe("GooglePurchaseProvider", () => {
  test("normalizes active sandbox subscription payload into purchase event", () => {
    const event = normalizeGooglePurchasePayload({
      billingType: "monthly",
      fallbackProductId: "trailbook_premium_monthly",
      payload: {
        expiryTimeMillis: String(Date.parse("2099-08-01T00:00:00.000Z")),
        orderId: "GPA.1234-5678-9012-34567..0",
        paymentState: 1,
        purchaseType: 0,
        startTimeMillis: String(Date.parse("2026-07-01T00:00:00.000Z")),
      },
      purchaseToken: "google-token-1",
      userId: "user-1",
    });

    assert.equal(event.environment, "sandbox");
    assert.equal(event.eventType, "PURCHASED");
    assert.equal(event.provider, "google");
    assert.equal(event.providerOriginalTransactionId, "GPA.1234-5678-9012-34567");
    assert.equal(event.providerProductId, "trailbook_premium_monthly");
    assert.equal(event.providerTransactionId, "GPA.1234-5678-9012-34567..0");
    assert.equal(event.purchaseResult, "success");
    assert.equal(event.userId, "user-1");
  });

  test("normalizes pending product purchase into pending event", () => {
    const event = normalizeGooglePurchasePayload({
      billingType: "lifetime",
      fallbackProductId: "trailbook_lifetime",
      payload: {
        orderId: "GPA.7654-3210-1234-56789",
        purchaseState: 2,
        purchaseTimeMillis: String(Date.parse("2026-07-01T00:00:00.000Z")),
        purchaseType: 0,
      },
      purchaseToken: "google-token-2",
      userId: "user-1",
    });

    assert.equal(event.eventType, "PENDING");
    assert.equal(event.purchaseResult, "pending");
    assert.equal(event.providerProductId, "trailbook_lifetime");
  });
});
