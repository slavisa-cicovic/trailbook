import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, before, beforeEach, describe, test } from "node:test";

import type { INestApplication } from "@nestjs/common";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
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
  const originalFetch = global.fetch;
  const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
  const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const originalAuthBaseUrl = process.env.AUTH_BASE_URL;
  const originalWebAppUrl = process.env.WEB_APP_URL;
  const originalMediaStorageDir = process.env.MEDIA_STORAGE_DIR;

  before(async () => {
    app = await createApp();
    await app.init();
    databaseService = app.get(DatabaseService);
  });

  after(async () => {
    global.fetch = originalFetch;
    process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalGoogleClientSecret;
    process.env.AUTH_BASE_URL = originalAuthBaseUrl;
    process.env.WEB_APP_URL = originalWebAppUrl;
    process.env.MEDIA_STORAGE_DIR = originalMediaStorageDir;
    await app.close();
  });

  beforeEach(async () => {
    global.fetch = originalFetch;
    process.env.GOOGLE_CLIENT_ID = "google-test-client";
    process.env.GOOGLE_CLIENT_SECRET = "google-test-secret";
    process.env.AUTH_BASE_URL = "http://localhost:3001";
    process.env.WEB_APP_URL = "http://localhost:3000";
    process.env.MEDIA_STORAGE_DIR = "/tmp/trailbook-test-media";

    await databaseService.$executeRawUnsafe(`
      TRUNCATE TABLE
        external_identities,
        mail_outbox,
        password_reset_tokens,
        sessions,
        trip_points,
        trip_segments,
        waypoint_attachments,
        trip_shares,
        trips,
        waypoints,
        subscriptions,
        plans,
        users
      RESTART IDENTITY CASCADE
    `);

    await rm("/tmp/trailbook-test-media", { force: true, recursive: true }).catch(() => undefined);
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

  test("google login start redirects to consent screen and sets a state cookie", async () => {
    const response = await request(app.getHttpServer()).get("/api/auth/google");

    assert.equal(response.status, 302);
    assert.match(response.headers.location ?? "", /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    assert.match(response.headers["set-cookie"]?.[0] ?? "", /trailbook_oauth_state_google=/);
  });

  test("google callback links a verified provider identity to an existing local user", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "google-test-key";

    const idToken = await new SignJWT({
      email: "slavisa@example.com",
      email_verified: true,
      name: "Slavisa Google",
    })
      .setProtectedHeader({ alg: "RS256", kid: "google-test-key" })
      .setIssuer("https://accounts.google.com")
      .setAudience("google-test-client")
      .setSubject("google-subject-123")
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(privateKey);

    global.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(
          JSON.stringify({
            access_token: "google-access-token",
            id_token: idToken,
            token_type: "Bearer",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url === "https://www.googleapis.com/oauth2/v3/certs") {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch URL in google social auth test: ${url}`);
    }) as typeof fetch;

    const agent = request.agent(app.getHttpServer());
    const startResponse = await agent.get("/api/auth/google");
    const state = new URL(startResponse.headers.location ?? "").searchParams.get("state");

    assert.ok(state);

    const callbackResponse = await agent.get(`/api/auth/google/callback?code=test-code&state=${encodeURIComponent(state!)}`);

    assert.equal(callbackResponse.status, 302);
    assert.equal(callbackResponse.headers.location, "http://localhost:3000/dashboard");
    const callbackCookies = callbackResponse.headers["set-cookie"];
    const sessionCookie = Array.isArray(callbackCookies)
      ? callbackCookies.find((value: string) => value.startsWith("trailbook_session="))
      : callbackCookies;

    assert.match(sessionCookie ?? "", /trailbook_session=/);

    const meResponse = await agent.get("/api/auth/me");
    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.user.email, "slavisa@example.com");
    assert.deepEqual(meResponse.body.user.providers.sort(), ["google", "local"]);

    const externalIdentity = await databaseService.externalIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: "google",
          providerSubject: "google-subject-123",
        },
      },
    });

    assert.ok(externalIdentity);

    const users = await databaseService.user.findMany();
    assert.equal(users.length, 1);
  });

  test("owner can sync a trip, share it with another user, and the recipient can read it", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Owner",
      email: "owner@example.com",
      password: "password123",
    });
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Recipient",
      email: "recipient@example.com",
      password: "password123",
    });

    const ownerLogin = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "owner@example.com",
      password: "password123",
    });
    const recipientLogin = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "recipient@example.com",
      password: "password123",
    });

    assert.equal(ownerLogin.status, 201);
    assert.equal(recipientLogin.status, 201);

    const syncResponse = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        localId: "trip-local-1",
        deviceId: "device-1",
        title: "Drive to Belgrade",
        description: "Shared test trip",
        recordingProfile: "drive",
        startedAt: "2026-04-09T08:00:00.000Z",
        endedAt: "2026-04-09T10:00:00.000Z",
        createdAt: "2026-04-09T08:00:00.000Z",
        updatedAt: "2026-04-09T10:00:00.000Z",
        deletedAt: null,
        attachments: [
          {
            localId: "attachment-1",
            waypointLocalId: "waypoint-1",
            type: "photo",
            mimeType: "image/jpeg",
            fileSize: 12,
            createdAt: "2026-04-09T09:00:00.000Z",
            updatedAt: "2026-04-09T09:00:00.000Z",
            deletedAt: null,
          },
        ],
        segments: [
          {
            localId: "segment-1",
            recordingProfile: "drive",
            startedAt: "2026-04-09T08:00:00.000Z",
            endedAt: "2026-04-09T10:00:00.000Z",
            createdAt: "2026-04-09T08:00:00.000Z",
            updatedAt: "2026-04-09T10:00:00.000Z",
          },
        ],
        points: [
          {
            localId: "point-1",
            segmentLocalId: "segment-1",
            latitude: 44.7866,
            longitude: 20.4489,
            recordedAt: "2026-04-09T08:30:00.000Z",
            accuracy: 8,
            altitude: null,
            speed: 12,
          },
          {
            localId: "point-2",
            segmentLocalId: "segment-1",
            latitude: 44.8125,
            longitude: 20.4612,
            recordedAt: "2026-04-09T09:30:00.000Z",
            accuracy: 9,
            altitude: null,
            speed: 13,
          },
        ],
        waypoints: [
          {
            localId: "waypoint-1",
            segmentLocalId: "segment-1",
            category: "restaurant",
            latitude: 44.8,
            longitude: 20.45,
            title: "Lunch stop",
            note: "Shared waypoint",
            createdAt: "2026-04-09T09:00:00.000Z",
            updatedAt: "2026-04-09T09:00:00.000Z",
            deletedAt: null,
          },
        ],
      });

    assert.equal(syncResponse.status, 201);
    assert.ok(syncResponse.body.tripId);

    const uploadResponse = await request(app.getHttpServer())
      .post(`/api/trips/${syncResponse.body.tripId}/attachments/upload`)
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .field("attachmentLocalId", "attachment-1")
      .attach("file", Buffer.from("fake-image-content"), {
        contentType: "image/jpeg",
        filename: "lunch-stop.jpg",
      });

    assert.equal(uploadResponse.status, 201);
    assert.equal(uploadResponse.body.attachmentLocalId, "attachment-1");

    const shareResponse = await request(app.getHttpServer())
      .post(`/api/trips/${syncResponse.body.tripId}/shares`)
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        recipientEmail: "recipient@example.com",
      });

    assert.equal(shareResponse.status, 201);
    assert.equal(shareResponse.body.recipient.email, "recipient@example.com");

    const recipientSharedTripsResponse = await request(app.getHttpServer())
      .get("/api/trips/shared/list")
      .set("Authorization", `Bearer ${recipientLogin.body.sessionToken}`);

    assert.equal(recipientSharedTripsResponse.status, 200);
    assert.equal(recipientSharedTripsResponse.body.sharedTrips.length, 1);
    assert.equal(recipientSharedTripsResponse.body.sharedTrips[0]?.trip.title, "Drive to Belgrade");

    const sharedTripDetailResponse = await request(app.getHttpServer())
      .get(`/api/trips/shared/${shareResponse.body.shareId}`)
      .set("Authorization", `Bearer ${recipientLogin.body.sessionToken}`);

    assert.equal(sharedTripDetailResponse.status, 200);
    assert.equal(sharedTripDetailResponse.body.trip.points.length, 2);
    assert.equal(sharedTripDetailResponse.body.trip.waypoints.length, 1);
    assert.equal(sharedTripDetailResponse.body.trip.attachments.length, 1);

    const attachmentContentResponse = await request(app.getHttpServer())
      .get(`/api/trips/attachments/${uploadResponse.body.attachmentId}/content`)
      .set("Authorization", `Bearer ${recipientLogin.body.sessionToken}`);

    assert.equal(attachmentContentResponse.status, 200);
    assert.match(String(attachmentContentResponse.headers["content-type"] ?? ""), /^image\/jpeg/);
    assert.equal(Buffer.isBuffer(attachmentContentResponse.body), true);

    const selfShareResponse = await request(app.getHttpServer())
      .post(`/api/trips/${syncResponse.body.tripId}/shares`)
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        recipientEmail: "owner@example.com",
      });

    assert.equal(selfShareResponse.status, 400);
  });
});
