import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import * as createAppModule from "../src/app/create-app";
import { DatabaseService } from "../src/database/database.service";

const createApp =
  (
    createAppModule as typeof import("../src/app/create-app") & {
      default?: { createApp?: typeof import("../src/app/create-app")["createApp"] };
    }
  ).default?.createApp ?? createAppModule.createApp;

describe("purchases integration", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  const originalEnableFakePurchases = process.env.ENABLE_FAKE_PURCHASES;
  const originalAllowFakePurchasesForAll = process.env.ALLOW_FAKE_PURCHASES_FOR_ALL;
  const originalAllowFakePurchasesInProduction = process.env.ALLOW_FAKE_PURCHASES_IN_PRODUCTION;
  const originalPurchaseEnvironment = process.env.PURCHASE_ENVIRONMENT;
  const originalMediaStorageBackend = process.env.MEDIA_STORAGE_BACKEND;
  const originalDisablePurchaseEntitlementEnforcement = process.env.DISABLE_PURCHASE_ENTITLEMENT_ENFORCEMENT;

  before(async () => {
    app = await createApp();
    await app.init();
    databaseService = app.get(DatabaseService);
  });

  after(async () => {
    process.env.ENABLE_FAKE_PURCHASES = originalEnableFakePurchases;
    process.env.ALLOW_FAKE_PURCHASES_FOR_ALL = originalAllowFakePurchasesForAll;
    process.env.ALLOW_FAKE_PURCHASES_IN_PRODUCTION = originalAllowFakePurchasesInProduction;
    process.env.PURCHASE_ENVIRONMENT = originalPurchaseEnvironment;
    process.env.MEDIA_STORAGE_BACKEND = originalMediaStorageBackend;
    process.env.DISABLE_PURCHASE_ENTITLEMENT_ENFORCEMENT = originalDisablePurchaseEntitlementEnforcement;
    await app.close();
  });

  beforeEach(async () => {
    process.env.ENABLE_FAKE_PURCHASES = "false";
    process.env.ALLOW_FAKE_PURCHASES_FOR_ALL = "false";
    process.env.ALLOW_FAKE_PURCHASES_IN_PRODUCTION = "false";
    process.env.PURCHASE_ENVIRONMENT = "local";
    process.env.MEDIA_STORAGE_BACKEND = "file";
    process.env.DISABLE_PURCHASE_ENTITLEMENT_ENFORCEMENT = "false";

    await databaseService.$executeRawUnsafe(`
      TRUNCATE TABLE
        external_identities,
        access_tokens,
        email_verification_tokens,
        mail_outbox,
        password_reset_tokens,
        sessions,
        raw_location_events,
        trip_route_variants,
        trip_points,
        trip_segments,
        waypoint_attachments,
        trip_shares,
        trip_diagnostics,
        trip_group_members,
        trip_groups,
        trips,
        waypoints,
        user_entitlements,
        purchase_transactions,
        subscriptions,
        store_products,
        plans,
        users
      RESTART IDENTITY CASCADE
    `);
  });

  test("authenticated user can list fake products while fake simulation is disabled", async () => {
    const { token } = await registerVerifiedUser("products@example.com");

    const response = await request(app.getHttpServer())
      .get("/api/purchases/products?provider=fake")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.length, 3);
    assert.equal(response.body[0].provider, "fake");

    const storedProducts = await databaseService.storeProduct.findMany();
    assert.equal(storedProducts.length, 3);
  });

  test("fake simulation is rejected when disabled", async () => {
    const { token } = await registerVerifiedUser("disabled@example.com", "test_user");

    const response = await request(app.getHttpServer())
      .post("/api/purchases/fake/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        providerProductId: "trailbook_premium_monthly",
        scenario: "success",
      });

    assert.equal(response.status, 503);
  });

  test("normal user cannot simulate fake purchase unless explicitly allowed", async () => {
    process.env.ENABLE_FAKE_PURCHASES = "true";
    const { token } = await registerVerifiedUser("normal@example.com");

    const response = await request(app.getHttpServer())
      .post("/api/purchases/fake/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        providerProductId: "trailbook_premium_monthly",
        scenario: "success",
      });

    assert.equal(response.status, 403);
  });

  test("test user can simulate monthly purchase and current access reflects paid entitlements", async () => {
    process.env.ENABLE_FAKE_PURCHASES = "true";
    const { token } = await registerVerifiedUser("monthly@example.com", "test_user");

    const response = await simulate(token, "trailbook_premium_monthly", "success");

    assert.equal(response.status, 201);
    assert.equal(response.body.purchaseResult, "success");
    assert.equal(response.body.planCode, "premium_monthly");
    assert.equal(response.body.subscriptionStatus, "active");
    assert.deepEqual(response.body.entitlements, ["cloud_backup", "photo_storage", "sharing", "sync"]);

    const accessResponse = await request(app.getHttpServer())
      .get("/api/purchases/me")
      .set("Authorization", `Bearer ${token}`);

    assert.equal(accessResponse.status, 200);
    assert.equal(accessResponse.body.planCode, "premium_monthly");
    assert.deepEqual(accessResponse.body.entitlements, ["cloud_backup", "photo_storage", "sharing", "sync"]);
  });

  test("yearly and lifetime purchases activate matching plans", async () => {
    process.env.ENABLE_FAKE_PURCHASES = "true";
    const { token: yearlyToken } = await registerVerifiedUser("yearly@example.com", "test_user");
    const { token: lifetimeToken } = await registerVerifiedUser("lifetime@example.com", "test_user");

    const yearlyResponse = await simulate(yearlyToken, "trailbook_premium_yearly", "success");
    const lifetimeResponse = await simulate(lifetimeToken, "trailbook_lifetime", "success");

    assert.equal(yearlyResponse.status, 201);
    assert.equal(yearlyResponse.body.planCode, "premium_yearly");
    assert.equal(yearlyResponse.body.subscriptionStatus, "active");
    assert.ok(yearlyResponse.body.currentPeriodEndsAt);

    assert.equal(lifetimeResponse.status, 201);
    assert.equal(lifetimeResponse.body.planCode, "premium_lifetime");
    assert.equal(lifetimeResponse.body.subscriptionStatus, "lifetime");
    assert.equal(lifetimeResponse.body.currentPeriodEndsAt, null);
  });

  test("renew extends paid access period", async () => {
    process.env.ENABLE_FAKE_PURCHASES = "true";
    const { token } = await registerVerifiedUser("renew@example.com", "test_user");

    const purchaseResponse = await simulate(token, "trailbook_premium_monthly", "success");
    const renewResponse = await simulate(token, "trailbook_premium_monthly", "renew");

    assert.equal(renewResponse.status, 201);
    assert.equal(renewResponse.body.planCode, "premium_monthly");
    assert.ok(
      new Date(renewResponse.body.currentPeriodEndsAt).getTime() >
        new Date(purchaseResponse.body.currentPeriodEndsAt).getTime(),
    );
  });

  test("subscription cancel keeps access until period end", async () => {
    process.env.ENABLE_FAKE_PURCHASES = "true";
    const { token } = await registerVerifiedUser("cancel-subscription@example.com", "test_user");

    await simulate(token, "trailbook_premium_monthly", "success");
    const response = await simulate(token, "trailbook_premium_monthly", "subscription_canceled");

    assert.equal(response.status, 201);
    assert.equal(response.body.subscriptionStatus, "canceled");
    assert.deepEqual(response.body.entitlements, ["cloud_backup", "photo_storage", "sharing", "sync"]);
  });

  test("expired, refund and revoke remove paid entitlements", async () => {
    process.env.ENABLE_FAKE_PURCHASES = "true";

    for (const scenario of ["expired", "refund", "revoke"] as const) {
      const { token } = await registerVerifiedUser(`${scenario}@example.com`, "test_user");

      await simulate(token, "trailbook_premium_monthly", "success");
      const response = await simulate(token, "trailbook_premium_monthly", scenario);

      assert.equal(response.status, 201);
      assert.equal(response.body.planCode, "demo");
      assert.deepEqual(response.body.entitlements, []);
    }
  });

  test("declined and pending writes transaction but grant no paid entitlement", async () => {
    process.env.ENABLE_FAKE_PURCHASES = "true";

    for (const scenario of ["decline", "pending"] as const) {
      const { token, userId } = await registerVerifiedUser(`${scenario}@example.com`, "test_user");
      const response = await simulate(token, "trailbook_premium_monthly", scenario);

      assert.equal(response.status, 201);
      assert.equal(response.body.purchaseResult, scenario === "decline" ? "declined" : "pending");
      assert.equal(response.body.planCode, "demo");
      assert.deepEqual(response.body.entitlements, []);

      const transactions = await databaseService.purchaseTransaction.findMany({
        where: {
          userId,
        },
      });
      assert.equal(transactions.length, 1);
      assert.equal(transactions[0]?.purchaseResult, scenario === "decline" ? "declined" : "pending");
    }
  });

  test("duplicate idempotency key is idempotent", async () => {
    process.env.ENABLE_FAKE_PURCHASES = "true";
    const { token, userId } = await registerVerifiedUser("idempotent@example.com", "test_user");
    const transactionId = "fake-fixed-idempotency-test";

    await simulate(token, "trailbook_premium_monthly", "success", transactionId);
    await simulate(token, "trailbook_premium_monthly", "success", transactionId);

    const transactions = await databaseService.purchaseTransaction.findMany({
      where: {
        userId,
      },
    });
    assert.equal(transactions.length, 1);
  });

  test("sync endpoint requires sync entitlement", async () => {
    const { token } = await registerVerifiedUser("sync-rejected@example.com");

    const response = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${token}`)
      .send(buildSyncTripPayload("sync-rejected-trip"));

    assert.equal(response.status, 403);
    assert.match(String(response.body.message), /sync/);
  });

  test("premium fake purchase unlocks sync entitlement", async () => {
    process.env.ENABLE_FAKE_PURCHASES = "true";
    const { token } = await registerVerifiedUser("sync-allowed@example.com", "test_user");

    await simulate(token, "trailbook_premium_monthly", "success");

    const response = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${token}`)
      .send(buildSyncTripPayload("sync-allowed-trip"));

    assert.equal(response.status, 201);
    assert.equal(response.body.tripLocalId, "sync-allowed-trip");
  });

  test("photo upload and sharing require their own entitlements", async () => {
    const { token, userId } = await registerVerifiedUser("granular@example.com");
    await grantEntitlement(userId, "sync");

    const syncResponse = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${token}`)
      .send(buildSyncTripPayload("granular-trip", { attachmentLocalId: "granular-attachment" }));

    assert.equal(syncResponse.status, 201);

    const uploadResponse = await request(app.getHttpServer())
      .post(`/api/trips/${syncResponse.body.tripId}/attachments/upload`)
      .set("Authorization", `Bearer ${token}`)
      .field("attachmentLocalId", "granular-attachment")
      .attach("file", Buffer.from("photo"), {
        contentType: "image/jpeg",
        filename: "photo.jpg",
      });
    assert.equal(uploadResponse.status, 403);
    assert.match(String(uploadResponse.body.message), /photo_storage/);

    const shareResponse = await request(app.getHttpServer())
      .post(`/api/trips/${syncResponse.body.tripId}/shares`)
      .set("Authorization", `Bearer ${token}`)
      .send({ recipientEmail: "recipient-granular@example.com" });
    assert.equal(shareResponse.status, 403);
    assert.match(String(shareResponse.body.message), /sharing/);
  });

  test("shared recipient can read shared trip without paid sharing entitlement", async () => {
    const { token: ownerToken } = await registerVerifiedUser("share-owner@example.com", "test_user");
    const { token: recipientToken } = await registerVerifiedUser("share-recipient@example.com");
    process.env.ENABLE_FAKE_PURCHASES = "true";

    await simulate(ownerToken, "trailbook_premium_monthly", "success");

    const syncResponse = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(buildSyncTripPayload("recipient-read-trip"));
    assert.equal(syncResponse.status, 201);

    const shareResponse = await request(app.getHttpServer())
      .post(`/api/trips/${syncResponse.body.tripId}/shares`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ recipientEmail: "share-recipient@example.com" });
    assert.equal(shareResponse.status, 201);

    const sharedListResponse = await request(app.getHttpServer())
      .get("/api/trips/shared/list")
      .set("Authorization", `Bearer ${recipientToken}`);
    assert.equal(sharedListResponse.status, 200);
    assert.equal(sharedListResponse.body.sharedTrips.length, 1);

    const sharedDetailResponse = await request(app.getHttpServer())
      .get(`/api/trips/shared/${shareResponse.body.shareId}`)
      .set("Authorization", `Bearer ${recipientToken}`);
    assert.equal(sharedDetailResponse.status, 200);
    assert.equal(sharedDetailResponse.body.trip.title, "recipient-read-trip");
  });

  async function simulate(
    token: string,
    providerProductId: string,
    scenario: string,
    transactionId?: string,
  ) {
    return request(app.getHttpServer())
      .post("/api/purchases/fake/simulate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        providerProductId,
        scenario,
        transactionId,
      });
  }

  async function grantEntitlement(userId: string, entitlementCode: string) {
    await databaseService.userEntitlement.create({
      data: {
        active: true,
        entitlementCode,
        sourceType: "manual_grant",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        userId,
      },
    });
  }

  function buildSyncTripPayload(
    localId: string,
    options: { attachmentLocalId?: string } = {},
  ) {
    const attachmentLocalId = options.attachmentLocalId ?? `${localId}-attachment`;

    return {
      attachments: [
        {
          createdAt: "2026-04-09T09:00:00.000Z",
          deletedAt: null,
          fileSize: 12,
          localId: attachmentLocalId,
          mimeType: "image/jpeg",
          type: "photo",
          updatedAt: "2026-04-09T09:00:00.000Z",
          waypointLocalId: `${localId}-waypoint`,
        },
      ],
      createdAt: "2026-04-09T08:00:00.000Z",
      deletedAt: null,
      description: null,
      deviceId: "device-purchase-test",
      endedAt: "2026-04-09T10:00:00.000Z",
      localId,
      points: [
        {
          accuracy: 8,
          altitude: null,
          latitude: 44.7866,
          localId: `${localId}-point-1`,
          longitude: 20.4489,
          recordedAt: "2026-04-09T08:30:00.000Z",
          segmentLocalId: `${localId}-segment`,
          speed: 12,
        },
      ],
      recordingProfile: "drive",
      segments: [
        {
          createdAt: "2026-04-09T08:00:00.000Z",
          endedAt: "2026-04-09T10:00:00.000Z",
          localId: `${localId}-segment`,
          recordingProfile: "drive",
          startedAt: "2026-04-09T08:00:00.000Z",
          updatedAt: "2026-04-09T10:00:00.000Z",
        },
      ],
      startedAt: "2026-04-09T08:00:00.000Z",
      title: localId,
      updatedAt: "2026-04-09T10:00:00.000Z",
      waypoints: [
        {
          category: "generic",
          createdAt: "2026-04-09T09:00:00.000Z",
          deletedAt: null,
          latitude: 44.8,
          localId: `${localId}-waypoint`,
          longitude: 20.45,
          note: null,
          segmentLocalId: `${localId}-segment`,
          title: "Waypoint",
          updatedAt: "2026-04-09T09:00:00.000Z",
        },
      ],
    };
  }

  async function registerVerifiedUser(email: string, role: "admin" | "test_user" | "user" = "user") {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: email.split("@")[0],
      email,
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        toEmail: email,
        subject: "Verify your Trailbook email",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

    const user = await databaseService.user.update({
      where: { email },
      data: { role },
    });

    const loginResponse = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email,
      password: "password123",
    });

    assert.equal(loginResponse.status, 201);
    assert.ok(loginResponse.body.sessionToken);

    return {
      token: loginResponse.body.sessionToken as string,
      userId: user.id,
    };
  }
});
