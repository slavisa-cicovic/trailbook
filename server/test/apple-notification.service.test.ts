import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AutoRenewStatus,
  Environment,
  NotificationTypeV2,
  Status,
  Subtype,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";

import type { AuthenticatedUser } from "../src/auth/auth.service";
import type { DatabaseService } from "../src/database/database.service";
import { AppleNotificationService } from "../src/purchases/apple-notification.service";
import type { ApplePurchaseConfig } from "../src/purchases/apple-purchase.config";
import type {
  AppleStoreGateway,
  VerifiedAppleNotification,
} from "../src/purchases/apple-store.gateway";
import type { PurchaseApplicationService } from "../src/purchases/purchase-application.service";
import type { NormalizedPurchaseEvent } from "../src/purchases/purchase.types";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_TOKEN = "20000000-0000-4000-8000-000000000002";
const PRODUCT_ID = "trailbook_premium_monthly";
const ADMIN: AuthenticatedUser = {
  displayName: "Admin",
  email: "admin@example.com",
  id: USER_ID,
  role: "admin",
};

describe("AppleNotificationService", () => {
  test("processes TEST once and acknowledges a duplicate", async () => {
    const harness = createHarness({ "test-payload": notification(NotificationTypeV2.TEST) });

    const first = await harness.service.handleSignedPayload("test-payload");
    const second = await harness.service.handleSignedPayload("test-payload");

    assert.deepEqual(first, { duplicate: false, status: "processed", test: true });
    assert.deepEqual(second, { duplicate: true, status: "processed" });
    assert.equal(harness.events.length, 0);
    assert.equal(harness.verifyCalls, 1);
  });

  test("normalizes renewal, cancellation and grace period notifications", async () => {
    const harness = createHarness({
      canceled: notification(NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS, {
        autoRenewEnabled: false,
        subtype: Subtype.AUTO_RENEW_DISABLED,
      }),
      grace: notification(NotificationTypeV2.DID_FAIL_TO_RENEW, {
        gracePeriodExpiresDate: Date.now() + 60_000,
        status: Status.BILLING_GRACE_PERIOD,
        subtype: Subtype.GRACE_PERIOD,
      }),
      renewed: notification(NotificationTypeV2.DID_RENEW),
    });

    await harness.service.handleSignedPayload("renewed");
    await harness.service.handleSignedPayload("canceled");
    await harness.service.handleSignedPayload("grace");

    assert.equal(harness.events[0].eventType, "RENEWED");
    assert.equal(harness.events[0].subscriptionStatus, "active");
    assert.equal(harness.events[1].eventType, "CANCELED");
    assert.equal(harness.events[1].subscriptionStatus, "canceled");
    assert.equal(harness.events[2].eventType, "RESTORED");
    assert.equal(harness.events[2].subscriptionStatus, "in_grace_period");
  });

  test("removes access for expiration and refund notifications", async () => {
    const harness = createHarness({
      expired: notification(NotificationTypeV2.EXPIRED, { status: Status.EXPIRED }),
      refund: notification(NotificationTypeV2.REFUND, { revocationDate: Date.now() }),
    });

    await harness.service.handleSignedPayload("expired");
    await harness.service.handleSignedPayload("refund");

    assert.equal(harness.events[0].eventType, "EXPIRED");
    assert.equal(harness.events[0].subscriptionStatus, "expired");
    assert.equal(harness.events[1].eventType, "REFUNDED");
    assert.equal(harness.events[1].subscriptionStatus, "revoked");
  });

  test("safely persists and ignores an unknown notification type", async () => {
    const harness = createHarness({ unknown: notification("FUTURE_APPLE_EVENT") });

    const result = await harness.service.handleSignedPayload("unknown");

    assert.deepEqual(result, { duplicate: false, status: "ignored" });
    assert.equal(harness.events.length, 0);
    assert.equal(harness.audits[0].processingStatus, "ignored");
  });

  test("recovers missed history and reuses normal idempotent processing", async () => {
    const harness = createHarness({ recovered: notification(NotificationTypeV2.DID_RENEW) });
    harness.historyPayloads.push("recovered", "recovered");

    const result = await harness.service.recoverHistory(ADMIN, {
      environment: "sandbox",
      startDate: new Date(Date.now() - 60_000).toISOString(),
    });

    assert.deepEqual(result, { failed: 0, processed: 2, total: 2 });
    assert.equal(harness.events.length, 1);
  });

  test("deduplicates different payloads carrying the same Apple notification UUID", async () => {
    const first = notification(NotificationTypeV2.DID_RENEW);
    const second = notification(NotificationTypeV2.DID_RENEW);
    const harness = createHarness({ first, second });

    await harness.service.handleSignedPayload("first");
    const result = await harness.service.handleSignedPayload("second");

    assert.deepEqual(result, { duplicate: true, status: "processed" });
    assert.equal(harness.events.length, 1);
  });

  test("reprocesses a previously failed notification", async () => {
    const notifications: Record<string, VerifiedAppleNotification> = {};
    const harness = createHarness(notifications);

    await assert.rejects(() => harness.service.handleSignedPayload("retry-payload"));
    assert.equal(harness.audits[0].processingStatus, "failed");

    notifications["retry-payload"] = notification(NotificationTypeV2.DID_RENEW);
    const result = await harness.service.reprocessFailed(ADMIN);

    assert.deepEqual(result, { failed: 0, processed: 1, total: 1 });
    assert.equal(harness.audits[0].processingStatus, "processed");
    assert.equal(harness.events.length, 1);
  });
});

function createHarness(notifications: Record<string, VerifiedAppleNotification>) {
  const audits: Array<Record<string, any>> = [];
  const events: NormalizedPurchaseEvent[] = [];
  const historyPayloads: string[] = [];
  let verifyCalls = 0;
  const database = {
    applePurchaseNotification: {
      create: async ({ data }: any) => {
        const record = {
          attemptCount: 0,
          id: `audit-${audits.length + 1}`,
          processingStatus: "received",
          receivedAt: new Date(),
          ...data,
        };
        audits.push(record);
        return record;
      },
      findMany: async ({ take, where }: any) =>
        audits
          .filter((record) =>
            where?.processingStatus
              ? record.processingStatus === where.processingStatus
              : true,
          )
          .slice(0, take),
      findUnique: async ({ where }: any) =>
        audits.find((record) =>
          where.payloadHash
            ? record.payloadHash === where.payloadHash
            : record.notificationUuid === where.notificationUuid,
        ) ?? null,
      update: async ({ data, where }: any) => {
        const record = audits.find((item) => item.id === where.id)!;
        for (const [key, value] of Object.entries(data)) {
          record[key] =
            value && typeof value === "object" && "increment" in value
              ? Number(record[key] ?? 0) + Number((value as any).increment)
              : value;
        }
        return record;
      },
    },
    user: {
      findUnique: async ({ where }: any) =>
        where.appleAppAccountToken === ACCOUNT_TOKEN
          ? { appleAppAccountToken: ACCOUNT_TOKEN, id: USER_ID }
          : null,
    },
  } as unknown as DatabaseService;
  const purchaseApplication = {
    applyEvent: async (event: NormalizedPurchaseEvent) => {
      if (!events.some((existing) => existing.idempotencyKey === event.idempotencyKey)) {
        events.push(event);
      }
      return {};
    },
  } as unknown as PurchaseApplicationService;
  const config = {
    bundleId: "com.slavisacicovic.trailbook",
    productIds: new Set([PRODUCT_ID]),
  } as ApplePurchaseConfig;
  const gateway: AppleStoreGateway = {
    getNotificationHistory: async () => historyPayloads,
    requestTestNotification: async () => "test-notification-token",
    verifyNotification: async (signedPayload) => {
      verifyCalls += 1;
      const value = notifications[signedPayload];
      if (!value) throw new Error("Unknown test payload");
      return value;
    },
    verifySubscription: async () => {
      throw new Error("Not used by this test.");
    },
  };
  const service = new AppleNotificationService(database, purchaseApplication, config, gateway);
  return {
    audits,
    events,
    get verifyCalls() {
      return verifyCalls;
    },
    historyPayloads,
    service,
  };
}

function notification(
  type: NotificationTypeV2 | string,
  options: {
    autoRenewEnabled?: boolean;
    gracePeriodExpiresDate?: number;
    revocationDate?: number;
    status?: Status;
    subtype?: Subtype;
  } = {},
): VerifiedAppleNotification {
  const payload: ResponseBodyV2DecodedPayload = {
    data: {
      appAppleId: 6789852326,
      bundleId: "com.slavisacicovic.trailbook",
      environment: Environment.SANDBOX,
      status: options.status ?? Status.ACTIVE,
    },
    notificationType: type,
    notificationUUID: `uuid-${type}-${options.subtype ?? "none"}`,
    signedDate: Date.now(),
    subtype: options.subtype,
    version: "2.0",
  };
  if (type === NotificationTypeV2.TEST) {
    return { environment: Environment.SANDBOX, payload, renewalInfo: null, transaction: null };
  }
  return {
    environment: Environment.SANDBOX,
    payload,
    renewalInfo: {
      appAccountToken: ACCOUNT_TOKEN,
      autoRenewStatus:
        options.autoRenewEnabled === false ? AutoRenewStatus.OFF : AutoRenewStatus.ON,
      gracePeriodExpiresDate: options.gracePeriodExpiresDate,
      originalTransactionId: "original-transaction-1",
      productId: PRODUCT_ID,
    },
    transaction: {
      appAccountToken: ACCOUNT_TOKEN,
      bundleId: "com.slavisacicovic.trailbook",
      environment: Environment.SANDBOX,
      expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      originalTransactionId: "original-transaction-1",
      productId: PRODUCT_ID,
      purchaseDate: Date.now(),
      revocationDate: options.revocationDate,
      transactionId: `transaction-${type}-${options.subtype ?? "none"}`,
    },
  };
}
