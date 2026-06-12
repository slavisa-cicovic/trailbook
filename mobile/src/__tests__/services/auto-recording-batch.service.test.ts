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
  buildAutoBatchProfileSections,
  inferAutoRecordingProfile,
  type AutoLocationPoint,
} from "../../services/recording/auto-recording.service";
import type { RecordingProfile, RecordingSessionSummary, Trip, TripSegment } from "../../domain/trips";

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
      tripPoints: _tripPoints,
      tripSegments: segments,
      waypoints,
    }),
  ),
  removeInitialAutoBootstrapWalkSegment: vi.fn(
    (segments: TripSegment[], points: unknown, waypoints: unknown) => ({
      tripPoints: points,
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

function makeSession(profile: RecordingProfile = "walk"): RecordingSessionSummary {
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

function makeSegment(profile: RecordingProfile = "walk"): TripSegment {
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

describe("buildAutoBatchProfileSections", () => {
  function makeTimelineSample(offsetSeconds: number, speedMs: number): AutoLocationPoint {
    return {
      accuracy: 5,
      latitude: 45.014 + offsetSeconds * 0.00001,
      longitude: 19.811,
      recordedAt: iso(offsetSeconds),
      speed: speedMs,
    };
  }

  function makeStationaryTimelineSample(offsetSeconds: number): AutoLocationPoint {
    return {
      accuracy: 5,
      latitude: 45.014,
      longitude: 19.811,
      recordedAt: iso(offsetSeconds),
      speed: 0,
    };
  }

  it("splits one offline batch into chronological profile sections", () => {
    const walkOut = Array.from({ length: 5 }, (_, index) => makeTimelineSample(index * 30, 1.4));
    const drive = Array.from({ length: 6 }, (_, index) => makeTimelineSample(150 + index * 30, 13.9));
    const walkBack = Array.from({ length: 4 }, (_, index) => makeTimelineSample(330 + index * 30, 1.3));

    const sections = buildAutoBatchProfileSections([...walkOut, ...drive, ...walkBack], "walk");

    expect(sections.map((section) => section.profile)).toEqual(["walk", "drive", "walk"]);
    expect(sections.map((section) => section.samples.length)).toEqual([5, 6, 4]);
    expect(sections[1]?.startedAt).toBe(drive[0]?.recordedAt);
    expect(sections[2]?.startedAt).toBe(walkBack[0]?.recordedAt);
  });

  it("detects stationary when the batch has a stable low-movement run", () => {
    const stationary = Array.from({ length: 8 }, (_, index) => makeStationaryTimelineSample(index * 30));

    const sections = buildAutoBatchProfileSections(stationary, "walk");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.profile).toBe("stationary");
    expect(sections[0]?.samples).toHaveLength(stationary.length);
  });

  it("splits walk-bike-stationary-walk into chronological sections", () => {
    const walkOut = Array.from({ length: 5 }, (_, index) => makeTimelineSample(index * 30, 1.3));
    const bike = Array.from({ length: 5 }, (_, index) => makeTimelineSample(150 + index * 30, 3.5));
    const stationary = Array.from({ length: 6 }, (_, index) => makeStationaryTimelineSample(300 + index * 30));
    const walkBack = Array.from({ length: 5 }, (_, index) => makeTimelineSample(480 + index * 30, 1.2));

    const sections = buildAutoBatchProfileSections(
      [...walkOut, ...bike, ...stationary, ...walkBack],
      "walk",
    );

    expect(sections.map((section) => section.profile)).toEqual(["walk", "bike", "stationary", "walk"]);
    expect(sections.map((section) => section.samples.length)).toEqual([5, 5, 6, 5]);
    expect(sections[2]?.startedAt).toBe(stationary[0]?.recordedAt);
    expect(sections[3]?.startedAt).toBe(walkBack[0]?.recordedAt);
  });

  it("starts with drive profile when batch opens at drive speed (no walk prefix)", () => {
    // 6 samples × 30 s = 150 s > AUTO_BATCH_MIN_DRIVE_RUN_MS (60 s)
    const drive = Array.from({ length: 6 }, (_, index) => makeTimelineSample(index * 30, 13.9));

    const sections = buildAutoBatchProfileSections(drive, "walk");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.profile).toBe("drive");
  });

  it("merges two walk runs separated by a stationary gap into one section", () => {
    // walkA: 4 samples × 15 s = 45 s > AUTO_BATCH_MIN_WALK_RUN_MS (30 s)
    const walkA = Array.from({ length: 4 }, (_, index) => makeTimelineSample(index * 15, 1.1));
    // stationary gap at t=60 — skipped by profile run builder
    const gap = [makeTimelineSample(60, 0)];
    // walkB: 4 samples × 15 s starting at t=70
    const walkB = Array.from({ length: 4 }, (_, index) => makeTimelineSample(70 + index * 15, 1.1));

    const sections = buildAutoBatchProfileSections([...walkA, ...gap, ...walkB], "walk");

    // Both walk runs are merged into one section (same profile, no profile change)
    expect(sections).toHaveLength(1);
    expect(sections[0]?.profile).toBe("walk");
    expect(sections[0]?.samples).toHaveLength(walkA.length + gap.length + walkB.length);
  });

  it("uses fallback profile when batch duration is below the minimum run threshold", () => {
    // 2 samples × 5 s = 5 s span — well below AUTO_BATCH_MIN_BIKE_RUN_MS (45 s)
    const shortBike = [makeTimelineSample(0, 3.0), makeTimelineSample(5, 3.0)];

    const sections = buildAutoBatchProfileSections(shortBike, "walk");

    expect(sections).toHaveLength(1);
    expect(sections[0]?.profile).toBe("walk"); // fallback, not "bike"
  });
});

// ── inferAutoRecordingProfile — drive→walk inference window ───────────────────
//
// WALK_INFERENCE_WINDOW_MS = 2 min (reduced from 10 min).
// Scenario: user drove for 8 min then walked for 2 min.
// Old 10-min window: drive samples pollute the window → walk not detected.
// New 2-min window: only recent walk samples → walk correctly detected.

describe("inferAutoRecordingProfile — drive→walk with short inference window", () => {
  const NOW_MS = BASE_MS + 10 * 60 * 1000; // 10 min into the trip

  function makeSampleAt(offsetFromNowMs: number, speedMs: number): AutoLocationPoint {
    return {
      accuracy: 5,
      latitude: 45.015,
      longitude: 19.811,
      recordedAt: new Date(NOW_MS + offsetFromNowMs).toISOString(),
      speed: speedMs,
    };
  }

  // Drive samples at 50 km/h (13.9 m/s): 8 min ago → 2.5 min ago.
  // Speed > BIKE_MAX_KMH (35) so the 10-min bike window won't false-trigger.
  const driveSamples: AutoLocationPoint[] = Array.from({ length: 11 }, (_, i) =>
    makeSampleAt((-8 * 60 + i * 30) * 1000, 13.9),  // -480 s to -150 s
  );

  // Walk samples: last 2 min (within the 2-min inference window)
  const walkSamples: AutoLocationPoint[] = Array.from({ length: 8 }, (_, i) =>
    makeSampleAt((-2 * 60 + i * 15) * 1000, 1.1),  // -120 s to -15 s
  );

  const allSamples = [...driveSamples, ...walkSamples];

  it("detects walk when recent 2-min window is all walk-speed", () => {
    expect(inferAutoRecordingProfile(allSamples, null)).toBe("walk");
  });

  it("detects walk even if older drive samples dominate the full 10-min pool", () => {
    // sanity-check: drive samples are the majority (16 vs 8)
    expect(driveSamples.length).toBeGreaterThan(walkSamples.length);
    expect(inferAutoRecordingProfile(allSamples, null)).toBe("walk");
  });
});
