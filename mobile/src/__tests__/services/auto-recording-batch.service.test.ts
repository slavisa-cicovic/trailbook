// Regression test for batch AUTO-mode profile transition.
//
// Scenario (Andr test 29 1, 2026-05-30):
//   Android was in AUTO mode, recording-profile settled to "walk" based on the
//   first few slow-moving points (06:01–06:03).  The phone then went to background
//   and delivered 17+ fast-moving points all at once at 06:08:36, with recordedAt
//   timestamps spanning 06:03:27–06:04:54 (~87 s at ~3–5 m/s = bike profile).
//
//   Without batch pre-analysis: the "walk" implied-speed limit (12 km/h) rejects
//   all 17 batch points, so the northern part of the route is never recorded.
//
//   With applyBatchAutoTransitionIfNeeded: before any per-point filtering the
//   pipeline detects that the batch spans ≥ BIKE_STABILITY_MS (75 s) of bike-speed
//   data and immediately transitions the segment to "bike".  The main loop then
//   processes all batch points under the bike profile's filters, accepting them.

import { describe, expect, it, vi } from "vitest";

import {
  applyBatchAutoTransitionIfNeeded,
  type AutoLocationPoint,
} from "../../services/recording/auto-recording.service";
import type { RecordingSessionSummary, Trip, TripSegment } from "../../domain/trips";

vi.mock("../../services/recording/recording-config.service", () => ({
  getRuntimePointFilterProfileConfig: vi.fn().mockReturnValue(null),
  getRuntimeTrackingProfileConfig: vi.fn().mockReturnValue(null),
}));

vi.mock("../../services/trip-points/trip-point-diagnostics.service", () => ({
  isTripDiagnosticsEnabled: vi.fn().mockReturnValue(false),
  recordLocationCallback: vi.fn(),
  recordTripPointDiagnostic: vi.fn(),
  resetTripPointDiagnostics: vi.fn(),
}));

// Mock transitive Expo dependencies via the services that import them.
vi.mock("../../services/trip-segments/trip-segments.service", () => ({
  closeActiveTripSegment: vi.fn(
    (segments: TripSegment[], segmentLocalId: string, endedAt: string) =>
      segments.map((s) => (s.localId === segmentLocalId ? { ...s, endedAt } : s)),
  ),
  getOpenTripSegmentForTrip: vi.fn(
    (segments: TripSegment[], tripLocalId: string) =>
      segments.find((s) => s.tripLocalId === tripLocalId && s.endedAt === null) ?? null,
  ),
  startNextTripSegment: vi.fn(
    (trip: Trip, segments: TripSegment[], profile: string, startedAt: string) => {
      const nextSegment: TripSegment = {
        localId: "segment-2",
        serverId: null,
        tripLocalId: trip.localId,
        deviceId: trip.deviceId,
        userId: trip.userId,
        recordingProfile: profile as TripSegment["recordingProfile"],
        pointCount: null,
        distanceMeters: null,
        durationMs: null,
        statsUpdatedAt: null,
        startedAt,
        endedAt: null,
        createdAt: startedAt,
        updatedAt: startedAt,
        syncStatus: "local-only",
      };
      return { nextSegment, tripSegments: [...segments, nextSegment] };
    },
  ),
  normalizeAutoClosedTripSegment: vi.fn(
    (segments: TripSegment[], _tripPoints: unknown, waypoints: unknown) => ({
      tripSegments: segments,
      waypoints,
    }),
  ),
}));

vi.mock("../../services/recording/recording.service", () => ({
  updateRecordingAutoCandidate: vi.fn(
    (session: RecordingSessionSummary, profile: string | null, since: string | null) => ({
      ...session,
      autoCandidateProfile: profile,
      autoCandidateSince: since,
    }),
  ),
  updateRecordingSegment: vi.fn(
    (session: RecordingSessionSummary, segmentId: string, profile: string) => ({
      ...session,
      activeSegmentId: segmentId,
      recordingProfile: profile,
      autoCandidateProfile: null,
      autoCandidateSince: null,
    }),
  ),
}));

// ── helpers ──────────────────────────────────────────────────────────────────

const BASE_MS = 1_748_570_493_000; // 2026-05-30T06:01:33Z

function iso(offsetSeconds: number): string {
  return new Date(BASE_MS + offsetSeconds * 1000).toISOString();
}

function makeSample(offsetSeconds: number, speedMs: number, lat: number): AutoLocationPoint {
  return {
    accuracy: 6,
    latitude: lat,
    longitude: 19.8116,
    recordedAt: iso(offsetSeconds),
    speed: speedMs,
  };
}

function makeSession(profile: "walk" | "bike" | "drive" = "walk"): RecordingSessionSummary {
  return {
    status: "recording",
    activeTripId: "trip-1",
    activeSegmentId: "segment-1",
    startedAt: iso(0),
    lastPointRecordedAt: null,
    interruptedAt: null,
    userId: "user-1",
    userEmail: null,
    deviceId: "device-1",
    recordingMode: "auto",
    recordingProfile: profile,
    autoCandidateProfile: null,
    autoCandidateSince: null,
    motionActivityType: null,
    motionActivityConfidence: null,
    motionActivityRecordedAt: null,
    motionActivitySourcePlatform: null,
  };
}

function makeTrip(): Trip {
  return {
    localId: "trip-1",
    serverId: null,
    userId: "user-1",
    deviceId: "device-1",
    title: "Test Trip",
    description: null,
    recordingProfile: "walk",
    recordingConfig: null,
    batteryStartLevelPercent: null,
    batteryStartState: null,
    batteryEndLevelPercent: null,
    batteryEndState: null,
    pointCount: null,
    distanceMeters: null,
    statsUpdatedAt: null,
    startedAt: iso(0),
    endedAt: null,
    status: "active",
    deletedAt: null,
    createdAt: iso(0),
    updatedAt: iso(0),
    syncStatus: "local-only",
  };
}

function makeSegment(profile: "walk" | "bike" | "drive" = "walk"): TripSegment {
  return {
    localId: "segment-1",
    serverId: null,
    tripLocalId: "trip-1",
    deviceId: "device-1",
    userId: "user-1",
    recordingProfile: profile,
    pointCount: null,
    distanceMeters: null,
    durationMs: null,
    statsUpdatedAt: null,
    startedAt: iso(0),
    endedAt: null,
    createdAt: iso(0),
    updatedAt: iso(0),
    syncStatus: "local-only",
  };
}

// ── batch fixture ─────────────────────────────────────────────────────────────

// 17 points at bike speed (~3.5 m/s = 12.6 km/h), spanning 80 s.
// BIKE_STABILITY_MS = 75_000 ms, so this comfortably qualifies.
// BIKE_MIN_KMH = 8.5, BIKE_MAX_KMH = 35 → 12.6 is within range.
const BIKE_SPEED_MS = 3.5;
const LAT_STEP = 0.00027; // ~30 m northward per 5-s step at bike speed

const bikeBatch: AutoLocationPoint[] = Array.from({ length: 17 }, (_, i) => {
  const offsetSeconds = 114 + i * 5; // 06:03:14 to 06:04:34 relative to trip start
  const lat = 45.0149 + i * LAT_STEP;
  return makeSample(offsetSeconds, BIKE_SPEED_MS, lat);
});

// ── tests ────────────────────────────────────────────────────────────────────

describe("applyBatchAutoTransitionIfNeeded", () => {
  it("transitions walk→bike when batch spans ≥ BIKE_STABILITY_MS of bike-speed data", () => {
    const session = makeSession("walk");
    const trip = makeTrip();
    const segments = [makeSegment("walk")];

    const result = applyBatchAutoTransitionIfNeeded(
      session, trip, segments, [], [], bikeBatch, null,
    );

    expect(result.changed).toBe(true);
    expect(result.session.recordingProfile).toBe("bike");

    const bikeSegment = result.tripSegments.find((s) => s.recordingProfile === "bike");
    expect(bikeSegment).toBeDefined();
    expect(bikeSegment?.startedAt).toBe(bikeBatch[0]?.recordedAt);

    const walkSegment = result.tripSegments.find((s) => s.recordingProfile === "walk");
    expect(walkSegment?.endedAt).toBe(bikeBatch[0]?.recordedAt);
  });

  it("clamps transition time to segment start when first batch point precedes it", () => {
    const session = makeSession("walk");
    const trip = makeTrip();
    // Segment started at iso(0); first batch sample is at iso(-1) — GPS cache artifact
    const segment: TripSegment = { ...makeSegment("walk"), startedAt: iso(100) };

    // Build a batch where firstRecordedAt < segment.startedAt
    const earlyBatch: AutoLocationPoint[] = Array.from({ length: 17 }, (_, i) => ({
      accuracy: 6,
      latitude: 45.0149 + i * LAT_STEP,
      longitude: 19.8116,
      recordedAt: iso(95 + i * 5), // starts at 95 s, segment starts at 100 s
      speed: BIKE_SPEED_MS,
    }));

    const result = applyBatchAutoTransitionIfNeeded(
      session, trip, [segment], [], [], earlyBatch, null,
    );

    expect(result.changed).toBe(true);
    // Walk segment must NOT have endedAt before its startedAt
    const walkSegment = result.tripSegments.find((s) => s.recordingProfile === "walk");
    expect(walkSegment?.endedAt).toBe(segment.startedAt);
    // Bike segment starts at same clamped time
    const bikeSegment = result.tripSegments.find((s) => s.recordingProfile === "bike");
    expect(bikeSegment?.startedAt).toBe(segment.startedAt);
  });

  it("does nothing when batch span is below the stability threshold (< 75 s)", () => {
    const session = makeSession("walk");
    const trip = makeTrip();
    const segments = [makeSegment("walk")];

    // 5 samples × 5 s = 20 s span < 75 s
    const shortBatch = bikeBatch.slice(0, 5);

    const result = applyBatchAutoTransitionIfNeeded(
      session, trip, segments, [], [], shortBatch, null,
    );

    expect(result.changed).toBe(false);
    expect(result.session.recordingProfile).toBe("walk");
  });

  it("does nothing when inferred profile already matches current profile", () => {
    const session = makeSession("bike");
    const trip = makeTrip();
    const segments = [makeSegment("bike")];

    const result = applyBatchAutoTransitionIfNeeded(
      session, trip, segments, [], [], bikeBatch, null,
    );

    expect(result.changed).toBe(false);
  });

  it("does nothing when recordingMode is not auto", () => {
    const session: RecordingSessionSummary = {
      ...makeSession("walk"),
      recordingMode: "walk",
    };
    const trip = makeTrip();
    const segments = [makeSegment("walk")];

    const result = applyBatchAutoTransitionIfNeeded(
      session, trip, segments, [], [], bikeBatch, null,
    );

    expect(result.changed).toBe(false);
  });

  it("does nothing when there is no active segment", () => {
    const session: RecordingSessionSummary = {
      ...makeSession("walk"),
      activeSegmentId: null,
    };
    const trip = makeTrip();

    const result = applyBatchAutoTransitionIfNeeded(
      session, trip, [], [], [], bikeBatch, null,
    );

    expect(result.changed).toBe(false);
  });

  it("does nothing when fewer than 2 samples are provided", () => {
    const session = makeSession("walk");
    const trip = makeTrip();
    const segments = [makeSegment("walk")];

    const result = applyBatchAutoTransitionIfNeeded(
      session, trip, segments, [], [], [bikeBatch[0]!], null,
    );

    expect(result.changed).toBe(false);
  });
});
