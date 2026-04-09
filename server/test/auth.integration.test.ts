import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";

import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { DatabaseService } from "../src/database/database.service";
import * as createAppModule from "../src/app/create-app";

const createApp =
  (
    createAppModule as typeof import("../src/app/create-app") & {
      default?: { createApp?: typeof import("../src/app/create-app")["createApp"] };
    }
  ).default?.createApp ?? createAppModule.createApp;

describe("auth integration", () => {
  let app: INestApplication;
  let databaseService: DatabaseService;

  before(async () => {
    app = await createApp();
    await app.init();
    databaseService = app.get(DatabaseService);
  });

  after(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await databaseService.$executeRawUnsafe(`
      TRUNCATE TABLE
        external_identities,
        mail_outbox,
        password_reset_tokens,
        sessions,
        subscriptions,
        plans,
        users
      RESTART IDENTITY CASCADE
    `);
  });

  test("register creates a persisted local user with demo subscription", async () => {
    const response = await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.user.email, "slavisa@example.com");
    assert.equal(response.body.user.role, "user");
    assert.deepEqual(response.body.user.providers, ["local"]);

    const user = await databaseService.user.findUnique({
      where: { email: "slavisa@example.com" },
      include: { subscriptions: true },
    });

    assert.ok(user);
    assert.ok(user.passwordHash);
    assert.equal(user?.subscriptions.length, 1);
  });

  test("login sets session cookie and me returns the authenticated user", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const agent = request.agent(app.getHttpServer());
    const loginResponse = await agent.post("/api/auth/login").send({
      email: "slavisa@example.com",
      password: "password123",
    });

    assert.equal(loginResponse.status, 201);
    assert.match(loginResponse.headers["set-cookie"]?.[0] ?? "", /trailbook_session=/);

    const meResponse = await agent.get("/api/auth/me");
    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.user.email, "slavisa@example.com");
  });

  test("logout revokes the current session", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/auth/login").send({
      email: "slavisa@example.com",
      password: "password123",
    });

    const logoutResponse = await agent.post("/api/auth/logout").send({});
    assert.equal(logoutResponse.status, 201);

    const meResponse = await agent.get("/api/auth/me");
    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.user, null);

    const sessions = await databaseService.session.findMany();
    assert.equal(sessions.length, 1);
    assert.ok(sessions[0]?.revokedAt);
  });

  test("forgot-password creates a persisted reset token for an existing user", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const forgotResponse = await request(app.getHttpServer()).post("/api/auth/forgot-password").send({
      email: "slavisa@example.com",
    });

    assert.equal(forgotResponse.status, 201);
    assert.equal(forgotResponse.body.success, true);
    assert.equal(forgotResponse.body.tokenPreview, undefined);

    const tokens = await databaseService.passwordResetToken.findMany();
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0]?.usedAt, null);

    const outbox = await databaseService.mailOutbox.findMany();
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.toEmail, "slavisa@example.com");
  });

  test("reset-password updates the password and invalidates existing sessions", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/auth/login").send({
      email: "slavisa@example.com",
      password: "password123",
    });

    const forgotResponse = await request(app.getHttpServer()).post("/api/auth/forgot-password").send({
      email: "slavisa@example.com",
    });

    const outbox = await databaseService.mailOutbox.findFirstOrThrow();
    const resetTokenMatch = outbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(resetTokenMatch?.[1]);

    const resetResponse = await request(app.getHttpServer()).post("/api/auth/reset-password").send({
      token: decodeURIComponent(resetTokenMatch[1]),
      password: "newpassword123",
    });

    assert.equal(resetResponse.status, 201);
    assert.equal(resetResponse.body.success, true);

    const oldLoginResponse = await request(app.getHttpServer()).post("/api/auth/login").send({
      email: "slavisa@example.com",
      password: "password123",
    });
    assert.equal(oldLoginResponse.status, 401);

    const newLoginResponse = await request(app.getHttpServer()).post("/api/auth/login").send({
      email: "slavisa@example.com",
      password: "newpassword123",
    });
    assert.equal(newLoginResponse.status, 201);

    const tokens = await databaseService.passwordResetToken.findMany();
    assert.equal(tokens.length, 1);
    assert.ok(tokens[0]?.usedAt);
  });
});
