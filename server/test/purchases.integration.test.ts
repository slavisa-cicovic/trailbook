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
    await app.close();
  });

  beforeEach(async () => {
    process.env.ENABLE_FAKE_PURCHASES = "false";
    process.env.ALLOW_FAKE_PURCHASES_FOR_ALL = "false";
    process.env.ALLOW_FAKE_PURCHASES_IN_PRODUCTION = "false";
    process.env.PURCHASE_ENVIRONMENT = "local";
    process.env.MEDIA_STORAGE_BACKEND = "file";

    await databaseService.$executeRawUnsafe(`
      TRUNCATE TABLE
        external_identities,
        access_tokens,
        email_verification_tokens,
        mail_outbox,
        password_reset_tokens,
        sessions,
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
