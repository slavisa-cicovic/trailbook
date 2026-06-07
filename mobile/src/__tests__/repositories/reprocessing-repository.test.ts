import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RawLocationEvent } from "../../domain/raw-location-event";
import type { RecordingSessionSummary, Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";

const storageMocks = vi.hoisted(() => ({
  loadRawLocationEventsForTrip: vi.fn(),
  loadRecordingSession: vi.fn(),
  loadTripPointsForTrip: vi.fn(),
  loadTripSegments: vi.fn(),
  loadTrips: vi.fn(),
  loadWaypoints: vi.fn(),
}));

vi.mock("../../storage/trips-storage", () => ({
  loadTrips: storageMocks.loadTrips,
}));

vi.mock("../../storage/trip-segments-storage", () => ({
  loadTripSegments: storageMocks.loadTripSegments,
}));

vi.mock("../../storage/waypoints-storage", () => ({
  loadWaypoints: storageMocks.loadWaypoints,
}));

vi.mock("../../storage/trip-points-storage", () => ({
  loadTripPointsForTrip: storageMocks.loadTripPointsForTrip,
}));

vi.mock("../../storage/raw-location-events-storage", () => ({
  loadRawLocationEventsForTrip: storageMocks.loadRawLocationEventsForTrip,
}));

vi.mock("../../storage/recording-storage", () => ({
  loadRecordingSession: storageMocks.loadRecordingSession,
}));

const trip: Trip = {
  batteryEndLevelPercent: null,
  batteryEndState: null,
  batteryStartLevelPercent: null,
  batteryStartState: null,
  createdAt: "2026-06-02T09:00:00.000Z",
  deletedAt: null,
  description: null,
  deviceId: "device-1",
  distanceMeters: 50,
  endedAt: "2026-06-02T09:10:00.000Z",
  localId: "trip-1",
  pointCount: 1,
  recordingConfig: null,
  recordingProfile: "walk",
  serverId: null,
  startedAt: "2026-06-02T09:00:00.000Z",
  statsUpdatedAt: "2026-06-02T09:10:00.000Z",
  status: "ended",
  syncStatus: "synced",
  title: "Test trip",
  updatedAt: "2026-06-02T09:10:00.000Z",
  userId: "user-1",
};

const otherTrip: Trip = {
  ...trip,
  localId: "trip-2",
  title: "Other trip",
};

const segment: TripSegment = {
  createdAt: "2026-06-02T09:00:00.000Z",
  deviceId: "device-1",
  distanceMeters: 50,
  durationMs: 600000,
  endedAt: "2026-06-02T09:10:00.000Z",
  localId: "seg-1",
  pointCount: 1,
  recordingProfile: "walk",
  serverId: null,
  startedAt: "2026-06-02T09:00:00.000Z",
  statsUpdatedAt: "2026-06-02T09:10:00.000Z",
  syncStatus: "synced",
  tripLocalId: "trip-1",
  updatedAt: "2026-06-02T09:10:00.000Z",
  userId: "user-1",
};

const otherSegment: TripSegment = {
  ...segment,
  localId: "seg-other",
  tripLocalId: "trip-2",
};

const point: TripPoint = {
  accuracy: 8,
  altitude: null,
  deviceId: "device-1",
  latitude: 45,
  localId: "pt-1",
  longitude: 19,
  recordedAt: "2026-06-02T09:01:00.000Z",
  segmentLocalId: "seg-1",
  serverId: null,
  speed: 1,
  syncStatus: "synced",
  tripLocalId: "trip-1",
  userId: "user-1",
};

const waypoint: Waypoint = {
  category: "generic",
  createdAt: "2026-06-02T09:03:00.000Z",
  deletedAt: null,
  deviceId: "device-1",
  latitude: 45,
  localId: "wp-1",
  longitude: 19,
  note: null,
  segmentLocalId: "seg-1",
  serverId: null,
  syncStatus: "synced",
  title: "Waypoint",
  tripLocalId: "trip-1",
  updatedAt: "2026-06-02T09:03:00.000Z",
  userId: "user-1",
};

const rawEvent: RawLocationEvent = {
  acceptedTripPointLocalId: null,
  accuracy: 8,
  activeSegmentLocalId: "seg-1",
  altitude: null,
  batchId: "batch-1",
  batchIndex: 0,
  callbackSource: "background",
  latitude: 45,
  localId: "raw-1",
  longitude: 19,
  origin: "device",
  processedAt: null,
  processingDecision: null,
  processingStatus: "pending",
  receivedAt: "2026-06-02T09:01:00.000Z",
  recordedAt: "2026-06-02T09:01:00.000Z",
  segmentLocalId: null,
  sessionStartedAt: "2026-06-02T09:00:00.000Z",
  speed: 12,
  tripLocalId: "trip-1",
};

const idleSession: RecordingSessionSummary = {
  activeTripId: null,
  activeSegmentId: null,
  autoCandidateProfile: null,
  autoCandidateSince: null,
  deviceId: null,
  interruptedAt: null,
  lastPointRecordedAt: null,
  motionActivityConfidence: null,
  motionActivityRecordedAt: null,
  motionActivitySourcePlatform: null,
  motionActivityType: null,
  recordingMode: "auto",
  recordingProfile: "walk",
  startedAt: null,
  status: "idle",
  userEmail: null,
  userId: null,
};

describe("loadRawReprocessingInputModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.loadTrips.mockResolvedValue([trip, otherTrip]);
    storageMocks.loadTripSegments.mockResolvedValue([segment, otherSegment]);
    storageMocks.loadWaypoints.mockResolvedValue([waypoint]);
    storageMocks.loadTripPointsForTrip.mockResolvedValue([point]);
    storageMocks.loadRawLocationEventsForTrip.mockResolvedValue([rawEvent]);
    storageMocks.loadRecordingSession.mockResolvedValue(idleSession);
  });

  it("returns null when trip is not found", async () => {
    const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");

    storageMocks.loadTrips.mockResolvedValue([]);

    const result = await loadRawReprocessingInputModel("trip-1");

    expect(result).toBeNull();
  });

  it("returns null when trip is soft deleted", async () => {
    const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");

    storageMocks.loadTrips.mockResolvedValue([{ ...trip, deletedAt: "2026-06-02T12:00:00.000Z" }]);

    const result = await loadRawReprocessingInputModel("trip-1");

    expect(result).toBeNull();
  });

  it("returns input model with trip-scoped segments", async () => {
    const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");

    const result = await loadRawReprocessingInputModel("trip-1");

    expect(result).not.toBeNull();
    expect(result!.trip.localId).toBe("trip-1");
    expect(result!.tripSegments).toHaveLength(1);
    expect(result!.tripSegments[0]!.localId).toBe("seg-1");
  });

  it("includes all waypoints (not filtered by trip)", async () => {
    const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");
    const otherWaypoint: Waypoint = { ...waypoint, localId: "wp-2", tripLocalId: "trip-2" };

    storageMocks.loadWaypoints.mockResolvedValue([waypoint, otherWaypoint]);

    const result = await loadRawReprocessingInputModel("trip-1");

    expect(result!.waypoints).toHaveLength(2);
  });

  it("includes recording session", async () => {
    const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");

    const result = await loadRawReprocessingInputModel("trip-1");

    expect(result!.recordingSession?.status).toBe("idle");
  });

  it("includes raw events and old trip points for the given trip", async () => {
    const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");

    const result = await loadRawReprocessingInputModel("trip-1");

    expect(result!.rawEvents).toHaveLength(1);
    expect(result!.oldTripPoints).toHaveLength(1);
  });
});
