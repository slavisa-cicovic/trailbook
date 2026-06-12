// Integration test: batch pipeline native-service isolation.
//
// Verifies that batch AUTO processing changes Trailbook segments/filtering only,
// without touching native background location updates. This guards against Android
// regressions where restarting location updates while processing a sleep-recovery
// batch can leave FusedLocation silent until the app wakes again.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { persistBackgroundRecordedLocations } from "../../services/recording/recording-pipeline.service";
import * as locationService from "../../services/location/location.service";
import * as tripPointsStore from "../../state/trip-points-store";
import type { RecordingSessionSummary, Trip, TripPoint, TripSegment } from "../../domain/trips";

// ── expo / native module stubs ────────────────────────────────────────────────

vi.mock("expo-location", () => ({}));
vi.mock("expo-task-manager", () => ({}));
vi.mock("expo-modules-core", () => ({}));
vi.mock("../../services/motion/trailbook-motion-activity.native", () => ({ default: null }));

// ── state store mocks (inline vi.fn to avoid hoisting issues) ─────────────────

vi.mock("../../state/trip-points-store", () => ({
  mergeTripPoints: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../state/trip-segments-store", () => ({
  setTripSegments: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../state/waypoints-store", () => ({
  setWaypoints: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../state/recording-store", () => ({
  setRecordingSession: vi.fn().mockResolvedValue(undefined),
}));

// ── location service mock ─────────────────────────────────────────────────────

vi.mock("../../services/location/location.service", () => ({
  restartBackgroundLocationTracking: vi.fn().mockResolvedValue(undefined),
  toSnapshot: vi.fn((loc: { coords: Record<string, unknown>; timestamp: number }) => ({
    accuracy: (loc.coords.accuracy as number) ?? null,
    altitude: (loc.coords.altitude as number) ?? null,
    latitude: loc.coords.latitude as number,
    longitude: loc.coords.longitude as number,
    recordedAt: new Date(loc.timestamp).toISOString(),
    speed: (loc.coords.speed as number) ?? null,
  })),
}));

// ── other service mocks ───────────────────────────────────────────────────────

vi.mock("../../services/motion/motion-activity.service", () => ({
  getLatestMotionActivityAsync: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../services/recording/recording-config.service", () => ({
  getRuntimePointFilterProfileConfig: vi.fn().mockReturnValue(null),
  getRuntimeTrackingProfileConfig: vi.fn().mockReturnValue(null),
}));

vi.mock("../../services/trip-points/trip-point-diagnostics.service", () => ({
  isTripDiagnosticsEnabled: vi.fn().mockReturnValue(false),
  recordLocationCallback: vi.fn(),
  recordTripPointDiagnostic: vi.fn(),
  resetTripPointDiagnostics: vi.fn(),
  flushTripPointDiagnostics: vi.fn(),
  getTripDiagnosticsForSync: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../services/recording/recording.service", () => ({
  updateRecordingLastPoint: vi.fn(
    (session: RecordingSessionSummary, recordedAt: string) => ({ ...session, lastPointRecordedAt: recordedAt }),
  ),
  updateRecordingMotionActivity: vi.fn((session: RecordingSessionSummary) => session),
  updateRecordingSegment: vi.fn(
    (session: RecordingSessionSummary, segmentId: string, profile: string) => ({
      ...session,
      activeSegmentId: segmentId,
      recordingProfile: profile,
      autoCandidateProfile: null,
      autoCandidateSince: null,
    }),
  ),
  updateRecordingAutoCandidate: vi.fn(
    (session: RecordingSessionSummary, profile: string | null, since: string | null) => ({
      ...session,
      autoCandidateProfile: profile,
      autoCandidateSince: since,
    }),
  ),
}));

vi.mock("../../services/trip-segments/trip-segments.service", () => ({
  closeActiveTripSegment: vi.fn(
    (segments: TripSegment[], id: string, endedAt: string) =>
      segments.map((s) => (s.localId === id ? { ...s, endedAt } : s)),
  ),
  getOpenTripSegmentForTrip: vi.fn(
    (segments: TripSegment[], tripLocalId: string) =>
      segments.find((s) => s.tripLocalId === tripLocalId && !s.endedAt) ?? null,
  ),
  startNextTripSegment: vi.fn((trip: Trip, segments: TripSegment[], profile: string, startedAt: string) => {
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
  }),
  normalizeAutoClosedTripSegment: vi.fn(
    (segments: TripSegment[], _points: TripPoint[], waypoints: unknown) => ({
      tripPoints: _points,
      tripSegments: segments,
      waypoints,
    }),
  ),
  removeInitialAutoBootstrapWalkSegment: vi.fn(
    (segments: TripSegment[], points: TripPoint[], waypoints: unknown) => ({
      tripPoints: points,
      tripSegments: segments,
      waypoints,
    }),
  ),
}));

vi.mock("../../storage/recording-storage", () => ({
  loadRecordingSession: vi.fn().mockImplementation(() => Promise.resolve({
    status: "recording",
    activeTripId: "trip-1",
    activeSegmentId: "segment-1",
    startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    lastPointRecordedAt: null,
    interruptedAt: null,
    userId: "user-1",
    userEmail: null,
    deviceId: "device-1",
    recordingMode: "auto",
    recordingProfile: "walk",
    autoCandidateProfile: null,
    autoCandidateSince: null,
    motionActivityType: null,
    motionActivityConfidence: null,
    motionActivityRecordedAt: null,
    motionActivitySourcePlatform: null,
  } satisfies RecordingSessionSummary)),
}));
vi.mock("../../storage/trips-storage", () => ({
  loadTrips: vi.fn().mockImplementation(() => Promise.resolve([{
    localId: "trip-1",
    serverId: null,
    userId: "user-1",
    deviceId: "device-1",
    title: "Pipeline Test Trip",
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
    startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    endedAt: null,
    status: "active",
    deletedAt: null,
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    syncStatus: "local-only",
  } satisfies Trip])),
}));
vi.mock("../../storage/trip-segments-storage", () => ({
  loadTripSegments: vi.fn().mockImplementation(() => Promise.resolve([{
    localId: "segment-1",
    serverId: null,
    tripLocalId: "trip-1",
    deviceId: "device-1",
    userId: "user-1",
    recordingProfile: "walk",
    pointCount: null,
    distanceMeters: null,
    durationMs: null,
    statsUpdatedAt: null,
    startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    endedAt: null,
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    syncStatus: "local-only",
  } satisfies TripSegment])),
}));
vi.mock("../../storage/trip-points-storage", () => ({
  loadTripPointsForTrip: vi.fn().mockImplementation(() => Promise.resolve([])),
}));
vi.mock("../../storage/waypoints-storage", () => ({
  loadWaypoints: vi.fn().mockImplementation(() => Promise.resolve([])),
}));

// ── batch location data ───────────────────────────────────────────────────────

// Points recorded 3 min ago — triggers BATCH_DETECTION_LAG_MS (2 min).
// 17 points × 5 s = 80 s span > BIKE_STABILITY_MS (75 s) → profile infers "bike".
const BATCH_BASE_MS = Date.now() - 3 * 60 * 1000;

const batchLocations = Array.from({ length: 17 }, (_, i) => ({
  coords: {
    latitude: 45.0149 + i * 0.00027,
    longitude: 19.8116,
    accuracy: 8,
    altitude: 160,
    speed: 3.5, // 12.6 km/h — inside bike window
    heading: 0,
    altitudeAccuracy: null,
  },
  timestamp: BATCH_BASE_MS + i * 5000,
}));

// ── helpers ───────────────────────────────────────────────────────────────────

async function runPipeline() {
  return persistBackgroundRecordedLocations(batchLocations as never);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("recording pipeline — batch pre-loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves trip points from a batch without calling restartBackgroundLocationTracking", async () => {
    await runPipeline();

    // Points saved
    expect(vi.mocked(tripPointsStore.mergeTripPoints)).toHaveBeenCalled();
    const saved = vi.mocked(tripPointsStore.mergeTripPoints).mock.calls[0]?.[0] as TripPoint[];
    expect(saved.length).toBeGreaterThan(0);

    // Location service NOT touched during batch processing — prevents stop-without-restart bug
    expect(vi.mocked(locationService.restartBackgroundLocationTracking)).not.toHaveBeenCalled();
  });

  it("resolves without throwing", async () => {
    await expect(runPipeline()).resolves.toBeUndefined();
  });
});
