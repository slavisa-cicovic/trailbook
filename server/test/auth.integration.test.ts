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
  const originalMediaStorageBackend = process.env.MEDIA_STORAGE_BACKEND;
  const originalMediaStorageDir = process.env.MEDIA_STORAGE_DIR;
  const originalTripDiagnosticsEnabled = process.env.ENABLE_TRIP_DIAGNOSTICS;

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
    process.env.MEDIA_STORAGE_BACKEND = originalMediaStorageBackend;
    process.env.MEDIA_STORAGE_DIR = originalMediaStorageDir;
    process.env.ENABLE_TRIP_DIAGNOSTICS = originalTripDiagnosticsEnabled;
    await app.close();
  });

  beforeEach(async () => {
    global.fetch = originalFetch;
    process.env.GOOGLE_CLIENT_ID = "google-test-client";
    process.env.GOOGLE_CLIENT_SECRET = "google-test-secret";
    process.env.AUTH_BASE_URL = "http://localhost:3001";
    process.env.WEB_APP_URL = "http://localhost:3000";
    process.env.MEDIA_STORAGE_BACKEND = "file";
    process.env.MEDIA_STORAGE_DIR = "/tmp/trailbook-test-media";
    process.env.ENABLE_TRIP_DIAGNOSTICS = "true";

    await databaseService.$executeRawUnsafe(`
      TRUNCATE TABLE
        external_identities,
        access_tokens,
        email_verification_tokens,
        mail_outbox,
        password_reset_tokens,
        sessions,
        trip_diagnostics,
        trip_points,
        trip_segments,
        waypoint_attachments,
        trip_shares,
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

    await rm("/tmp/trailbook-test-media", { force: true, recursive: true }).catch(() => undefined);
  });

  test("register creates an unverified local user, verification token, and demo subscription", async () => {
    const response = await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.email, "slavisa@example.com");

    const user = await databaseService.user.findUnique({
      where: { email: "slavisa@example.com" },
      include: { subscriptions: true },
    });

    assert.ok(user);
    assert.ok(user.passwordHash);
    assert.equal(user.emailVerifiedAt, null);
    assert.equal(user?.subscriptions.length, 1);

    const verificationTokens = await databaseService.emailVerificationToken.findMany();
    assert.equal(verificationTokens.length, 1);
    assert.equal(verificationTokens[0]?.usedAt, null);

    const outbox = await databaseService.mailOutbox.findMany();
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0]?.status, "sent");
    assert.equal(outbox[0]?.toEmail, "slavisa@example.com");
  });

  test("login rejects unverified local users", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const loginResponse = await request(app.getHttpServer()).post("/api/auth/login").send({
      email: "slavisa@example.com",
      password: "password123",
    });

    assert.equal(loginResponse.status, 401);
    assert.equal(loginResponse.body.message, "Email is not verified.");
  });

  test("verify-email activates the user and login sets session cookie", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);

    const verifyResponse = await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );
    assert.equal(verifyResponse.status, 302);
    assert.match(verifyResponse.headers.location ?? "", /verification=verified/);

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

  test("mobile login returns access and refresh tokens and me works with the access token", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

    const loginResponse = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "slavisa@example.com",
      password: "password123",
    });

    assert.equal(loginResponse.status, 201);
    assert.ok(loginResponse.body.sessionToken);
    assert.ok(loginResponse.body.refreshToken);
    assert.ok(loginResponse.body.sessionExpiresAt);
    assert.ok(loginResponse.body.refreshExpiresAt);

    const meResponse = await request(app.getHttpServer())
      .get("/api/auth/mobile/me")
      .set("Authorization", `Bearer ${loginResponse.body.sessionToken}`);

    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.user.email, "slavisa@example.com");

    const accessTokens = await databaseService.accessToken.findMany();
    assert.equal(accessTokens.length, 1);
    assert.equal(accessTokens[0]?.revokedAt, null);
  });

  test("mobile recording config returns resolved point filters for the authenticated user", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

    const loginResponse = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "slavisa@example.com",
      password: "password123",
    });

    const configResponse = await request(app.getHttpServer())
      .get("/api/auth/mobile/recording-config")
      .set("Authorization", `Bearer ${loginResponse.body.sessionToken}`);

    assert.equal(configResponse.status, 200);
    assert.equal(configResponse.body.version, 3);
    assert.equal(configResponse.body.profiles, undefined);
    assert.equal(configResponse.body.pointFilters.ios.auto, undefined);
    assert.equal(configResponse.body.pointFilters.android.auto, undefined);
    assert.equal(configResponse.body.pointFilters.ios.walk.maxAccuracyMeters, 35);
    assert.equal(configResponse.body.pointFilters.android.walk.minMovementMeters, 4);
    assert.equal(configResponse.body.pointFilters.ios.drive.maxImpliedSpeedKmh, 180);
  });

  test("logout revokes the current session", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

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
    const accessTokens = await databaseService.accessToken.findMany();
    assert.equal(accessTokens.length, 1);
    assert.ok(accessTokens[0]?.revokedAt);
  });

  test("mobile refresh rotates tokens and invalidates the previous access token", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

    const loginResponse = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "slavisa@example.com",
      password: "password123",
    });

    const refreshResponse = await request(app.getHttpServer()).post("/api/auth/mobile/refresh").send({
      refreshToken: loginResponse.body.refreshToken,
    });

    assert.equal(refreshResponse.status, 201);
    assert.ok(refreshResponse.body.sessionToken);
    assert.ok(refreshResponse.body.refreshToken);
    assert.notEqual(refreshResponse.body.sessionToken, loginResponse.body.sessionToken);
    assert.notEqual(refreshResponse.body.refreshToken, loginResponse.body.refreshToken);

    const oldMeResponse = await request(app.getHttpServer())
      .get("/api/auth/mobile/me")
      .set("Authorization", `Bearer ${loginResponse.body.sessionToken}`);
    assert.equal(oldMeResponse.status, 200);
    assert.equal(oldMeResponse.body.user, null);

    const nextMeResponse = await request(app.getHttpServer())
      .get("/api/auth/mobile/me")
      .set("Authorization", `Bearer ${refreshResponse.body.sessionToken}`);
    assert.equal(nextMeResponse.status, 200);
    assert.equal(nextMeResponse.body.user.email, "slavisa@example.com");
  });

  test("forgot-password creates a persisted reset token for an existing user", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

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
    assert.equal(outbox.length, 2);
    const resetOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Trailbook password reset",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    assert.equal(resetOutbox.status, "sent");
    assert.equal(resetOutbox.toEmail, "slavisa@example.com");
  });

  test("reset-password updates the password and invalidates existing sessions", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Slavisa",
      email: "slavisa@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/auth/login").send({
      email: "slavisa@example.com",
      password: "password123",
    });

    const forgotResponse = await request(app.getHttpServer()).post("/api/auth/forgot-password").send({
      email: "slavisa@example.com",
    });

    const outbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Trailbook password reset",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
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
    const accessTokens = await databaseService.accessToken.findMany();
    assert.equal(accessTokens.length, 2);
    assert.ok(accessTokens.some((accessToken) => accessToken.revokedAt));
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

    const ownerVerificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "owner@example.com",
      },
    });
    const ownerVerifyTokenMatch = ownerVerificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(ownerVerifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(ownerVerifyTokenMatch![1]))}`,
    );

    const recipientVerificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "recipient@example.com",
      },
    });
    const recipientVerifyTokenMatch = recipientVerificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(recipientVerifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(recipientVerifyTokenMatch![1]))}`,
    );

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

  test("admin can read dashboard metrics for a selected range", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Admin",
      email: "admin@example.com",
      password: "password123",
    });

    const adminVerificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "admin@example.com",
      },
    });
    const adminVerifyTokenMatch = adminVerificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(adminVerifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(adminVerifyTokenMatch![1]))}`,
    );

    const adminUser = await databaseService.user.findUniqueOrThrow({
      where: { email: "admin@example.com" },
    });

    await databaseService.user.update({
      where: { id: adminUser.id },
      data: { role: "admin" },
    });

    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "User One",
      email: "user1@example.com",
      password: "password123",
    });
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "User Two",
      email: "user2@example.com",
      password: "password123",
    });

    const user1VerificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "user1@example.com",
      },
    });
    const user1VerifyTokenMatch = user1VerificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(user1VerifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(user1VerifyTokenMatch![1]))}`,
    );

    const adminAgent = request.agent(app.getHttpServer());
    const loginResponse = await adminAgent.post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    assert.equal(loginResponse.status, 201);

    const ownerLogin = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "user1@example.com",
      password: "password123",
    });
    assert.equal(ownerLogin.status, 201);

    const syncResponse = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        localId: "trip-local-admin-metric",
        deviceId: "device-admin-metric",
        title: "Admin metric trip",
        description: null,
        recordingProfile: "drive",
        startedAt: "2026-04-18T08:00:00.000Z",
        endedAt: "2026-04-18T09:00:00.000Z",
        createdAt: "2026-04-18T08:00:00.000Z",
        updatedAt: "2026-04-18T09:00:00.000Z",
        deletedAt: null,
        attachments: [
          {
            localId: "attachment-admin-metric",
            waypointLocalId: "waypoint-admin-metric",
            type: "photo",
            mimeType: "image/jpeg",
            fileSize: 4096,
            createdAt: "2026-04-18T08:30:00.000Z",
            updatedAt: "2026-04-18T08:30:00.000Z",
            deletedAt: null,
          },
        ],
        segments: [
          {
            localId: "segment-admin-metric",
            recordingProfile: "drive",
            startedAt: "2026-04-18T08:00:00.000Z",
            endedAt: "2026-04-18T09:00:00.000Z",
            createdAt: "2026-04-18T08:00:00.000Z",
            updatedAt: "2026-04-18T09:00:00.000Z",
          },
        ],
        points: [
          {
            localId: "point-admin-metric-1",
            segmentLocalId: "segment-admin-metric",
            latitude: 44.7866,
            longitude: 20.4489,
            recordedAt: "2026-04-18T08:10:00.000Z",
            accuracy: 8,
            altitude: null,
            speed: 10,
          },
          {
            localId: "point-admin-metric-2",
            segmentLocalId: "segment-admin-metric",
            latitude: 44.8125,
            longitude: 20.4612,
            recordedAt: "2026-04-18T08:20:00.000Z",
            accuracy: 7,
            altitude: null,
            speed: 12,
          },
        ],
        waypoints: [
          {
            localId: "waypoint-admin-metric",
            segmentLocalId: "segment-admin-metric",
            category: "restaurant",
            latitude: 44.8,
            longitude: 20.45,
            title: "Stop",
            note: null,
            createdAt: "2026-04-18T08:30:00.000Z",
            updatedAt: "2026-04-18T08:30:00.000Z",
            deletedAt: null,
          },
        ],
      });

    assert.equal(syncResponse.status, 201);

    const uploadResponse = await request(app.getHttpServer())
      .post(`/api/trips/${syncResponse.body.tripId}/attachments/upload`)
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .field("attachmentLocalId", "attachment-admin-metric")
      .attach("file", Buffer.from("fake-image-content"), {
        contentType: "image/jpeg",
        filename: "metric.jpg",
      });

    assert.equal(uploadResponse.status, 201);

    const dashboardResponse = await adminAgent
      .get("/api/admin/dashboard")
      .query({
        from: "2026-04-18T00:00:00.000Z",
        to: "2026-04-19T00:00:00.000Z",
      });

    assert.equal(dashboardResponse.status, 200);
    assert.equal(dashboardResponse.body.overview.totalUsers, 3);
    assert.equal(dashboardResponse.body.overview.newUsers, 0);
    assert.equal(dashboardResponse.body.overview.tripsCreated, 1);
    assert.equal(dashboardResponse.body.overview.totalTripPoints, 2);
    assert.equal(dashboardResponse.body.overview.averageTripPointsPerTrip, 2);
    assert.equal(dashboardResponse.body.overview.photosCreated, 1);
    assert.equal(dashboardResponse.body.overview.totalPhotoBytes, 18);
  });

  test("non-admin user cannot read dashboard metrics", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "User",
      email: "user@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "user@example.com",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

    const agent = request.agent(app.getHttpServer());
    const loginResponse = await agent.post("/api/auth/login").send({
      email: "user@example.com",
      password: "password123",
    });
    assert.equal(loginResponse.status, 201);

    const dashboardResponse = await agent
      .get("/api/admin/dashboard")
      .query({
        from: "2026-04-18T00:00:00.000Z",
        to: "2026-04-19T00:00:00.000Z",
      });

    assert.equal(dashboardResponse.status, 403);
  });

  test("trip sync stores diagnostics summary when diagnostics are enabled", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Diagnostics Owner",
      email: "diagnostics-owner@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "diagnostics-owner@example.com",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

    const owner = await databaseService.user.findUniqueOrThrow({
      where: { email: "diagnostics-owner@example.com" },
      select: { id: true },
    });

    const ownerLogin = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "diagnostics-owner@example.com",
      password: "password123",
    });

    const syncResponse = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        localId: "trip-local-diagnostics",
        deviceId: "device-diagnostics",
        title: "Diagnostics trip",
        description: null,
        recordingProfile: "walk",
        startedAt: "2026-04-20T08:00:00.000Z",
        endedAt: "2026-04-20T08:30:00.000Z",
        createdAt: "2026-04-20T08:00:00.000Z",
        updatedAt: "2026-04-20T08:30:00.000Z",
        deletedAt: null,
        diagnostics: {
          platform: "android",
          recordingMode: "walk",
          callbackCount: 42,
          decisionCount: 40,
          accepted: 38,
          acceptedAfterLongGap: 1,
          foregroundCallbacks: 18,
          backgroundCallbacks: 24,
          foregroundAccepted: 16,
          backgroundAccepted: 22,
          foregroundRejected: 2,
          backgroundRejected: 2,
          duplicateTimestamp: 0,
          duplicateCoordinates: 0,
          sessionDuplicateRecordedAt: 1,
          rejectedByAccuracy: 0,
          rejectedByMinMovement: 2,
          rejectedByJumpDistance: 0,
          rejectedByImpliedSpeed: 0,
          maxCallbackGapMs: 6000,
          maxRecordedGapMs: 6200,
          updatedAt: "2026-04-20T08:30:00.000Z",
          recentEvents: [
            {
              accuracy: 7.2,
              altitude: null,
              decision: "accepted",
              latitude: 45.0,
              longitude: 19.8,
              receivedAt: "2026-04-20T08:29:55.000Z",
              recordedAt: "2026-04-20T08:29:54.500Z",
              source: "background",
              speed: 1.2,
            },
          ],
        },
        attachments: [],
        segments: [
          {
            localId: "segment-diagnostics",
            recordingProfile: "walk",
            startedAt: "2026-04-20T08:00:00.000Z",
            endedAt: "2026-04-20T08:30:00.000Z",
            createdAt: "2026-04-20T08:00:00.000Z",
            updatedAt: "2026-04-20T08:30:00.000Z",
          },
        ],
        points: [
          {
            localId: "point-diagnostics-1",
            segmentLocalId: "segment-diagnostics",
            latitude: 45.0,
            longitude: 19.8,
            recordedAt: "2026-04-20T08:01:00.000Z",
            accuracy: 7,
            altitude: null,
            speed: 1.2,
          },
        ],
        waypoints: [],
      });

    assert.equal(syncResponse.status, 201);

    const trip = await databaseService.trip.findUniqueOrThrow({
      where: {
        ownerUserId_localSourceId: {
          ownerUserId: owner.id,
          localSourceId: "trip-local-diagnostics",
        },
      },
    });

    const diagnostics = await databaseService.tripDiagnostics.findUnique({
      where: {
        tripId_deviceId: {
          tripId: trip.id,
          deviceId: "device-diagnostics",
        },
      },
    });

    assert.ok(diagnostics);
    assert.equal(diagnostics?.platform, "android");
    assert.equal(diagnostics?.recordingMode, "walk");
    assert.equal(diagnostics?.callbackCount, 42);
    assert.equal(diagnostics?.accepted, 38);
    assert.equal(diagnostics?.acceptedAfterLongGap, 1);
    assert.equal(diagnostics?.rejectedByMinMovement, 2);
    assert.deepEqual(diagnostics?.recentEventsJson, [
      {
        accuracy: 7.2,
        altitude: null,
        decision: "accepted",
        latitude: 45,
        longitude: 19.8,
        receivedAt: "2026-04-20T08:29:55.000Z",
        recordedAt: "2026-04-20T08:29:54.500Z",
        source: "background",
        speed: 1.2,
      },
    ]);
  });

  test("user trip overview returns total and range-filtered owned trips only", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Owner",
      email: "owner-overview@example.com",
      password: "password123",
    });
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Other",
      email: "other-overview@example.com",
      password: "password123",
    });

    const ownerVerificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "owner-overview@example.com",
      },
    });
    const ownerVerifyTokenMatch = ownerVerificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(ownerVerifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(ownerVerifyTokenMatch![1]))}`,
    );

    const otherVerificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "other-overview@example.com",
      },
    });
    const otherVerifyTokenMatch = otherVerificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(otherVerifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(otherVerifyTokenMatch![1]))}`,
    );

    const ownerLogin = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "owner-overview@example.com",
      password: "password123",
    });
    const otherLogin = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "other-overview@example.com",
      password: "password123",
    });

    assert.equal(ownerLogin.status, 201);
    assert.equal(otherLogin.status, 201);

    const ownerTripOne = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        localId: "owner-trip-overview-1",
        deviceId: "device-owner-overview",
        title: "Owner trip one",
        description: null,
        recordingProfile: "bike",
        startedAt: "2026-04-10T08:00:00.000Z",
        endedAt: "2026-04-10T09:00:00.000Z",
        createdAt: "2026-04-10T08:00:00.000Z",
        updatedAt: "2026-04-10T09:00:00.000Z",
        deletedAt: null,
        attachments: [
          {
            localId: "owner-attachment-overview-1",
            waypointLocalId: "owner-waypoint-overview-1",
            type: "photo",
            mimeType: "image/jpeg",
            fileSize: 100,
            createdAt: "2026-04-10T08:30:00.000Z",
            updatedAt: "2026-04-10T08:30:00.000Z",
            deletedAt: null,
          },
        ],
        segments: [
          {
            localId: "owner-segment-overview-1",
            recordingProfile: "bike",
            startedAt: "2026-04-10T08:00:00.000Z",
            endedAt: "2026-04-10T09:00:00.000Z",
            createdAt: "2026-04-10T08:00:00.000Z",
            updatedAt: "2026-04-10T09:00:00.000Z",
          },
        ],
        points: [
          {
            localId: "owner-point-overview-1a",
            segmentLocalId: "owner-segment-overview-1",
            latitude: 44.7866,
            longitude: 20.4489,
            recordedAt: "2026-04-10T08:10:00.000Z",
            accuracy: 8,
            altitude: null,
            speed: 10,
          },
        ],
        waypoints: [
          {
            localId: "owner-waypoint-overview-1",
            segmentLocalId: "owner-segment-overview-1",
            category: "cafe",
            latitude: 44.8,
            longitude: 20.45,
            title: "Coffee",
            note: null,
            createdAt: "2026-04-10T08:30:00.000Z",
            updatedAt: "2026-04-10T08:30:00.000Z",
            deletedAt: null,
          },
        ],
      });

    assert.equal(ownerTripOne.status, 201);

    const ownerUploadResponse = await request(app.getHttpServer())
      .post(`/api/trips/${ownerTripOne.body.tripId}/attachments/upload`)
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .field("attachmentLocalId", "owner-attachment-overview-1")
      .attach("file", Buffer.from("owner-photo"), {
        contentType: "image/jpeg",
        filename: "owner-overview.jpg",
      });
    assert.equal(ownerUploadResponse.status, 201);

    const ownerTripTwo = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        localId: "owner-trip-overview-2",
        deviceId: "device-owner-overview",
        title: "Owner trip two",
        description: null,
        recordingProfile: "drive",
        startedAt: "2026-04-18T08:00:00.000Z",
        endedAt: "2026-04-18T10:00:00.000Z",
        createdAt: "2026-04-18T08:00:00.000Z",
        updatedAt: "2026-04-18T10:00:00.000Z",
        deletedAt: null,
        attachments: [],
        segments: [
          {
            localId: "owner-segment-overview-2",
            recordingProfile: "drive",
            startedAt: "2026-04-18T08:00:00.000Z",
            endedAt: "2026-04-18T10:00:00.000Z",
            createdAt: "2026-04-18T08:00:00.000Z",
            updatedAt: "2026-04-18T10:00:00.000Z",
          },
        ],
        points: [
          {
            localId: "owner-point-overview-2a",
            segmentLocalId: "owner-segment-overview-2",
            latitude: 44.81,
            longitude: 20.46,
            recordedAt: "2026-04-18T08:15:00.000Z",
            accuracy: 7,
            altitude: null,
            speed: 12,
          },
        ],
        waypoints: [
          {
            localId: "owner-waypoint-overview-2",
            segmentLocalId: "owner-segment-overview-2",
            category: "fuel",
            latitude: 44.82,
            longitude: 20.47,
            title: "Fuel",
            note: null,
            createdAt: "2026-04-18T09:00:00.000Z",
            updatedAt: "2026-04-18T09:00:00.000Z",
            deletedAt: null,
          },
        ],
      });

    assert.equal(ownerTripTwo.status, 201);

    const otherTrip = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${otherLogin.body.sessionToken}`)
      .send({
        localId: "other-trip-overview-1",
        deviceId: "device-other-overview",
        title: "Other user trip",
        description: null,
        recordingProfile: "walk",
        startedAt: "2026-04-18T07:00:00.000Z",
        endedAt: "2026-04-18T07:30:00.000Z",
        createdAt: "2026-04-18T07:00:00.000Z",
        updatedAt: "2026-04-18T07:30:00.000Z",
        deletedAt: null,
        attachments: [],
        segments: [
          {
            localId: "other-segment-overview-1",
            recordingProfile: "walk",
            startedAt: "2026-04-18T07:00:00.000Z",
            endedAt: "2026-04-18T07:30:00.000Z",
            createdAt: "2026-04-18T07:00:00.000Z",
            updatedAt: "2026-04-18T07:30:00.000Z",
          },
        ],
        points: [],
        waypoints: [],
      });

    assert.equal(otherTrip.status, 201);

    const totalOverviewResponse = await request(app.getHttpServer())
      .get("/api/trips/overview")
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`);

    assert.equal(totalOverviewResponse.status, 200);
    assert.equal(totalOverviewResponse.body.summary.trips, 2);
    assert.equal(totalOverviewResponse.body.summary.waypoints, 2);
    assert.equal(totalOverviewResponse.body.summary.photos, 1);
    assert.equal(totalOverviewResponse.body.trips.length, 2);
    assert.equal(totalOverviewResponse.body.range.from, null);
    assert.equal(totalOverviewResponse.body.range.to, null);

    const rangedOverviewResponse = await request(app.getHttpServer())
      .get("/api/trips/overview")
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .query({
        from: "2026-04-18T00:00:00.000Z",
        to: "2026-04-19T00:00:00.000Z",
      });

    assert.equal(rangedOverviewResponse.status, 200);
    assert.equal(rangedOverviewResponse.body.summary.trips, 1);
    assert.equal(rangedOverviewResponse.body.summary.waypoints, 1);
    assert.equal(rangedOverviewResponse.body.summary.photos, 0);
    assert.equal(rangedOverviewResponse.body.trips.length, 1);
    assert.equal(rangedOverviewResponse.body.trips[0].title, "Owner trip two");
  });

  test("user can fetch owned trip detail and update trip metadata", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Owner Detail",
      email: "owner-detail@example.com",
      password: "password123",
    });
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Other Detail",
      email: "other-detail@example.com",
      password: "password123",
    });

    const ownerVerificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "owner-detail@example.com",
      },
    });
    const ownerVerifyTokenMatch = ownerVerificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(ownerVerifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(ownerVerifyTokenMatch![1]))}`,
    );

    const otherVerificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "other-detail@example.com",
      },
    });
    const otherVerifyTokenMatch = otherVerificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(otherVerifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(otherVerifyTokenMatch![1]))}`,
    );

    const ownerLogin = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "owner-detail@example.com",
      password: "password123",
    });
    const otherLogin = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "other-detail@example.com",
      password: "password123",
    });

    const syncResponse = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        localId: "owner-trip-detail-1",
        deviceId: "device-owner-detail",
        title: "Owner detail trip",
        description: "Original description",
        recordingProfile: "bike",
        startedAt: "2026-04-18T08:00:00.000Z",
        endedAt: "2026-04-18T08:45:00.000Z",
        createdAt: "2026-04-18T08:00:00.000Z",
        updatedAt: "2026-04-18T08:45:00.000Z",
        deletedAt: null,
        attachments: [
          {
            localId: "owner-trip-detail-photo-1",
            waypointLocalId: "owner-trip-detail-waypoint-1",
            type: "photo",
            mimeType: "image/jpeg",
            fileSize: 100,
            createdAt: "2026-04-18T08:20:00.000Z",
            updatedAt: "2026-04-18T08:20:00.000Z",
            deletedAt: null,
          },
        ],
        segments: [
          {
            localId: "owner-trip-detail-segment-1",
            recordingProfile: "bike",
            startedAt: "2026-04-18T08:00:00.000Z",
            endedAt: "2026-04-18T08:45:00.000Z",
            createdAt: "2026-04-18T08:00:00.000Z",
            updatedAt: "2026-04-18T08:45:00.000Z",
          },
        ],
        points: [
          {
            localId: "owner-trip-detail-point-1",
            segmentLocalId: "owner-trip-detail-segment-1",
            latitude: 44.7866,
            longitude: 20.4489,
            recordedAt: "2026-04-18T08:10:00.000Z",
            accuracy: 8,
            altitude: null,
            speed: 10,
          },
          {
            localId: "owner-trip-detail-point-2",
            segmentLocalId: "owner-trip-detail-segment-1",
            latitude: 44.7966,
            longitude: 20.4589,
            recordedAt: "2026-04-18T08:20:00.000Z",
            accuracy: 8,
            altitude: null,
            speed: 11,
          },
        ],
        waypoints: [
          {
            localId: "owner-trip-detail-waypoint-1",
            segmentLocalId: "owner-trip-detail-segment-1",
            category: "cafe",
            latitude: 44.79,
            longitude: 20.45,
            title: "Coffee stop",
            note: "Nice place",
            createdAt: "2026-04-18T08:20:00.000Z",
            updatedAt: "2026-04-18T08:20:00.000Z",
            deletedAt: null,
          },
        ],
      });

    assert.equal(syncResponse.status, 201);

    const uploadResponse = await request(app.getHttpServer())
      .post(`/api/trips/${syncResponse.body.tripId}/attachments/upload`)
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .field("attachmentLocalId", "owner-trip-detail-photo-1")
      .attach("file", Buffer.from("trip-photo"), {
        contentType: "image/jpeg",
        filename: "detail.jpg",
      });
    assert.equal(uploadResponse.status, 201);

    const detailResponse = await request(app.getHttpServer())
      .get(`/api/trips/${syncResponse.body.tripId}`)
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`);

    assert.equal(detailResponse.status, 200);
    assert.equal(detailResponse.body.trip.title, "Owner detail trip");
    assert.equal(detailResponse.body.summary.waypointCount, 1);
    assert.equal(detailResponse.body.summary.photoCount, 1);
    assert.equal(detailResponse.body.segments.length, 1);
    assert.equal(detailResponse.body.points.length, 2);

    const otherDetailResponse = await request(app.getHttpServer())
      .get(`/api/trips/${syncResponse.body.tripId}`)
      .set("Authorization", `Bearer ${otherLogin.body.sessionToken}`);

    assert.equal(otherDetailResponse.status, 404);

    const patchResponse = await request(app.getHttpServer())
      .patch(`/api/trips/${syncResponse.body.tripId}`)
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        title: "Updated owner detail trip",
        description: "Updated description",
      });

    assert.equal(patchResponse.status, 200);
    assert.equal(patchResponse.body.trip.title, "Updated owner detail trip");
    assert.equal(patchResponse.body.trip.description, "Updated description");

    const otherPatchResponse = await request(app.getHttpServer())
      .patch(`/api/trips/${syncResponse.body.tripId}`)
      .set("Authorization", `Bearer ${otherLogin.body.sessionToken}`)
      .send({
        title: "Unauthorized change",
      });

    assert.equal(otherPatchResponse.status, 404);
  });

  test("user can save structured trip edits through the web edit endpoint", async () => {
    await request(app.getHttpServer()).post("/api/auth/register").send({
      displayName: "Editor Owner",
      email: "editor-owner@example.com",
      password: "password123",
    });

    const verificationOutbox = await databaseService.mailOutbox.findFirstOrThrow({
      where: {
        subject: "Verify your Trailbook email",
        toEmail: "editor-owner@example.com",
      },
    });
    const verifyTokenMatch = verificationOutbox.htmlBody.match(/token=([^"&]+)/);
    assert.ok(verifyTokenMatch?.[1]);
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${encodeURIComponent(decodeURIComponent(verifyTokenMatch![1]))}`,
    );

    const ownerLogin = await request(app.getHttpServer()).post("/api/auth/mobile/login").send({
      email: "editor-owner@example.com",
      password: "password123",
    });

    const syncResponse = await request(app.getHttpServer())
      .post("/api/trips/sync")
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        localId: "editor-trip-1",
        deviceId: "device-editor-owner",
        title: "Editable trip",
        description: "Before web edit",
        recordingProfile: "walk",
        startedAt: "2026-04-18T08:00:00.000Z",
        endedAt: "2026-04-18T08:45:00.000Z",
        createdAt: "2026-04-18T08:00:00.000Z",
        updatedAt: "2026-04-18T08:45:00.000Z",
        deletedAt: null,
        attachments: [],
        segments: [
          {
            localId: "editor-segment-1",
            recordingProfile: "walk",
            startedAt: "2026-04-18T08:00:00.000Z",
            endedAt: "2026-04-18T08:20:00.000Z",
            createdAt: "2026-04-18T08:00:00.000Z",
            updatedAt: "2026-04-18T08:20:00.000Z",
          },
          {
            localId: "editor-segment-2",
            recordingProfile: "bike",
            startedAt: "2026-04-18T08:20:00.000Z",
            endedAt: "2026-04-18T08:45:00.000Z",
            createdAt: "2026-04-18T08:20:00.000Z",
            updatedAt: "2026-04-18T08:45:00.000Z",
          },
        ],
        points: [
          {
            localId: "editor-point-1",
            segmentLocalId: "editor-segment-1",
            latitude: 44.7866,
            longitude: 20.4489,
            recordedAt: "2026-04-18T08:05:00.000Z",
            accuracy: 8,
            altitude: null,
            speed: 4,
          },
          {
            localId: "editor-point-2",
            segmentLocalId: "editor-segment-1",
            latitude: 44.7876,
            longitude: 20.4499,
            recordedAt: "2026-04-18T08:10:00.000Z",
            accuracy: 8,
            altitude: null,
            speed: 4,
          },
          {
            localId: "editor-point-3",
            segmentLocalId: "editor-segment-2",
            latitude: 44.7906,
            longitude: 20.4529,
            recordedAt: "2026-04-18T08:25:00.000Z",
            accuracy: 8,
            altitude: null,
            speed: 10,
          },
        ],
        waypoints: [
          {
            localId: "editor-waypoint-1",
            segmentLocalId: "editor-segment-1",
            category: "cafe",
            latitude: 44.787,
            longitude: 20.4495,
            title: "Coffee",
            note: "Original note",
            createdAt: "2026-04-18T08:12:00.000Z",
            updatedAt: "2026-04-18T08:12:00.000Z",
            deletedAt: null,
          },
        ],
      });

    assert.equal(syncResponse.status, 201);

    const editSaveResponse = await request(app.getHttpServer())
      .put(`/api/trips/${syncResponse.body.tripId}/edit`)
      .set("Authorization", `Bearer ${ownerLogin.body.sessionToken}`)
      .send({
        trip: {
          title: "Edited on web",
          description: "After web edit",
        },
        segments: [
          {
            localId: "editor-segment-1",
            recordingProfile: "bike",
            startedAt: "2026-04-18T08:00:00.000Z",
            endedAt: "2026-04-18T08:45:00.000Z",
            distanceMeters: 1000,
          },
        ],
        points: [
          {
            localId: "editor-point-1",
            segmentLocalId: "editor-segment-1",
            latitude: 44.7866,
            longitude: 20.4489,
            recordedAt: "2026-04-18T08:05:00.000Z",
          },
          {
            localId: "editor-point-3",
            segmentLocalId: "editor-segment-1",
            latitude: 44.7906,
            longitude: 20.4529,
            recordedAt: "2026-04-18T08:25:00.000Z",
          },
        ],
        waypoints: [
          {
            localId: "editor-waypoint-1",
            segmentLocalId: "editor-segment-1",
            category: "viewpoint",
            latitude: 44.787,
            longitude: 20.4495,
            title: "Updated waypoint",
            note: "Updated note",
            recordedAt: "2026-04-18T08:12:00.000Z",
            photoCount: 0,
          },
        ],
        pauses: [],
      });

    assert.equal(editSaveResponse.status, 200);
    assert.equal(editSaveResponse.body.trip.title, "Edited on web");
    assert.equal(editSaveResponse.body.trip.description, "After web edit");
    assert.equal(editSaveResponse.body.segments.length, 1);
    assert.equal(editSaveResponse.body.segments[0].recordingProfile, "bike");
    assert.equal(editSaveResponse.body.points.length, 2);
    assert.equal(editSaveResponse.body.waypoints[0].title, "Updated waypoint");
    assert.equal(editSaveResponse.body.waypoints[0].category, "viewpoint");
  });
});
