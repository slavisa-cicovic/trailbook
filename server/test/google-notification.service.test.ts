import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { DatabaseService } from "../src/database/database.service";
import { GoogleNotificationService } from "../src/purchases/google-notification.service";
import type { GooglePurchaseConfig } from "../src/purchases/google-purchase.config";
import type { GooglePurchaseProvider } from "../src/purchases/google-purchase.provider";
import type { GooglePubsubAuth } from "../src/purchases/google-pubsub-auth";

const PACKAGE_NAME = "com.slavisacicovic.trailbook";
const TOKEN = "purchase-token";
const USER_ID = "10000000-0000-4000-8000-000000000001";

describe("GoogleNotificationService", () => {
  test("authenticates and accepts a Play Console test notification", async () => {
    const harness = createHarness();
    const result = await harness.service.handlePush("Bearer valid", push("test-1", {
      packageName: PACKAGE_NAME,
      testNotification: { version: "1.0" },
      version: "1.0",
    }));

    assert.deepEqual(harness.authHeaders, ["Bearer valid"]);
    assert.deepEqual(result, { duplicate: false, status: "processed", test: true });
    assert.equal(harness.records.get("test-1")?.processingStatus, "processed");
  });

  test("deduplicates a processed Pub/Sub messageId", async () => {
    const harness = createHarness();
    const body = push("test-duplicate", {
      packageName: PACKAGE_NAME,
      testNotification: { version: "1.0" },
    });
    await harness.service.handlePush("Bearer valid", body);
    const result = await harness.service.handlePush("Bearer valid", body);

    assert.deepEqual(result, { duplicate: true, status: "processed" });
    assert.equal(harness.records.get("test-duplicate")?.attemptCount, 1);
  });

  test("resolves the owner and syncs authoritative Google subscription state", async () => {
    const harness = createHarness({ ownerUserId: USER_ID });
    await harness.service.handlePush("Bearer valid", push("renewal-1", {
      packageName: PACKAGE_NAME,
      subscriptionNotification: {
        notificationType: 2,
        purchaseToken: TOKEN,
        version: "1.0",
      },
    }));

    assert.deepEqual(harness.syncCalls, [{
      eventType: "RENEWED",
      idempotencyPrefix: "google:rtdn:renewal-1",
      purchaseToken: TOKEN,
      userId: USER_ID,
    }]);
    assert.equal(harness.records.get("renewal-1")?.userId, USER_ID);
  });

  test("persists a retryable failure when purchase ownership has not arrived yet", async () => {
    const harness = createHarness();
    await assert.rejects(
      harness.service.handlePush("Bearer valid", push("race-1", {
        packageName: PACKAGE_NAME,
        subscriptionNotification: { notificationType: 4, purchaseToken: TOKEN },
      })),
    );
    assert.equal(harness.records.get("race-1")?.processingStatus, "failed");
    assert.match(harness.records.get("race-1")?.lastError ?? "", /not been linked/i);
  });
});

interface AuditRecord {
  attemptCount: number;
  id: string;
  lastError: string | null;
  processingStatus: string;
  userId?: string | null;
}

function createHarness(options: { ownerUserId?: string } = {}) {
  const records = new Map<string, AuditRecord>();
  const authHeaders: Array<string | undefined> = [];
  const syncCalls: Array<Record<string, unknown>> = [];
  const notifications = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const record: AuditRecord = {
        attemptCount: 0,
        id: String(data.messageId),
        lastError: null,
        processingStatus: "received",
      };
      records.set(String(data.messageId), record);
      return record;
    },
    findUnique: async ({ where }: { where: { messageId: string } }) => records.get(where.messageId) ?? null,
    update: async ({ data, where }: { data: Record<string, unknown>; where: { id: string } }) => {
      const record = records.get(where.id)!;
      if (data.attemptCount) record.attemptCount += 1;
      if (typeof data.processingStatus === "string") record.processingStatus = data.processingStatus;
      if (typeof data.lastError === "string" || data.lastError === null) record.lastError = data.lastError;
      if (typeof data.userId === "string") record.userId = data.userId;
      return record;
    },
  };
  const database = {
    googlePurchaseNotification: notifications,
    purchaseEvent: {
      findFirst: async () => options.ownerUserId ? { userId: options.ownerUserId } : null,
    },
  } as unknown as DatabaseService;
  const config = { packageName: PACKAGE_NAME } as GooglePurchaseConfig;
  const provider = {
    syncPurchase: async (
      userId: string,
      purchaseToken: string,
      eventType: string,
      idempotencyPrefix: string,
    ) => syncCalls.push({ eventType, idempotencyPrefix, purchaseToken, userId }),
  } as unknown as GooglePurchaseProvider;
  const auth = {
    verify: async (authorization: string | undefined) => { authHeaders.push(authorization); },
  } as GooglePubsubAuth;
  return {
    authHeaders,
    records,
    service: new GoogleNotificationService(database, config, provider, auth),
    syncCalls,
  };
}

function push(messageId: string, notification: Record<string, unknown>) {
  return {
    message: {
      data: Buffer.from(JSON.stringify(notification)).toString("base64"),
      messageId,
    },
    subscription: "projects/trailbook/subscriptions/google-play-rtdn-push",
  };
}
