import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RawLocationEvent } from "../../domain/raw-location-event";
import type { Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import {
  applyRawEventReprocessing,
  previewRawEventReprocessing,
} from "../../services/recording/raw-event-reprocessing.service";
import {
  loadRawLocationEventsForTrip,
  updateRawLocationEventProcessingResults,
} from "../../storage/raw-location-events-storage";
import { loadTripPointsForTrip, replaceTripPointsForTrip } from "../../storage/trip-points-storage";
import { loadTripSegments, saveTripSegments } from "../../storage/trip-segments-storage";
import { loadTrips, saveTrips } from "../../storage/trips-storage";
import { loadWaypoints, saveWaypoints } from "../../storage/waypoints-storage";

vi.mock("../../storage/recording-storage", () => ({
  loadRecordingSession: vi.fn().mockResolvedValue({ status: "idle", activeTripId: null }),
}));

vi.mock("../../storage/raw-location-events-storage", () => ({
  loadRawLocationEventsForTrip: vi.fn(),
  updateRawLocationEventProcessingResults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/trip-points-storage", () => ({
  loadTripPointsForTrip: vi.fn(),
  replaceTripPointsForTrip: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/trip-segments-storage", () => ({
  loadTripSegments: vi.fn(),
  saveTripSegments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/trips-storage", () => ({
  loadTrips: vi.fn(),
  saveTrips: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/waypoints-storage", () => ({
  loadWaypoints: vi.fn(),
  saveWaypoints: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/recording/auto-recording.service", () => ({
  buildAutoBatchProfileSections: vi.fn((samples) => [{
    endedAt: samples[samples.length - 1].recordedAt,
    profile: "drive",
    samples,
    startedAt: samples[0].recordedAt,
  }]),
}));

vi.mock("../../services/trip-points/trip-points.service", () => ({
  appendTripPointIfUseful: vi.fn((tripPoints, nextTripPoint) => [...tripPoints, nextTripPoint]),
  calculateTripDistanceMeters: vi.fn((tripPoints) => Math.max(0, tripPoints.length - 1) * 100),
  createTripPointForLocation: vi.fn((trip, segmentLocalId, snapshot) => ({
    accuracy: snapshot.accuracy,
    altitude: snapshot.altitude,
    deviceId: trip.deviceId,
    latitude: snapshot.latitude,
    localId: `point-${snapshot.recordedAt}`,
    longitude: snapshot.longitude,
    recordedAt: snapshot.recordedAt,
    segmentLocalId,
    serverId: null,
    speed: snapshot.speed,
    syncStatus: "local-only",
    tripLocalId: trip.localId,
    userId: trip.userId,
  })),
  resetPendingTripPointContinuity: vi.fn(),
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
  serverId: "server-trip-1",
  startedAt: "2026-06-02T09:00:00.000Z",
  statsUpdatedAt: "2026-06-02T09:10:00.000Z",
  status: "ended",
  syncStatus: "synced",
  title: "Replay test",
  updatedAt: "2026-06-02T09:10:00.000Z",
  userId: "user-1",
};

const oldSegment: TripSegment = {
  createdAt: "2026-06-02T09:00:00.000Z",
  deviceId: "device-1",
  distanceMeters: 50,
  durationMs: 600000,
  endedAt: "2026-06-02T09:10:00.000Z",
  localId: "old-segment",
  pointCount: 1,
  recordingProfile: "walk",
  serverId: "server-segment-1",
  startedAt: "2026-06-02T09:00:00.000Z",
  statsUpdatedAt: "2026-06-02T09:10:00.000Z",
  syncStatus: "synced",
  tripLocalId: "trip-1",
  updatedAt: "2026-06-02T09:10:00.000Z",
  userId: "user-1",
};

const oldPoint: TripPoint = {
  accuracy: 8,
  altitude: null,
  deviceId: "device-1",
  latitude: 45,
  localId: "old-point",
  longitude: 19,
  recordedAt: "2026-06-02T09:01:00.000Z",
  segmentLocalId: "old-segment",
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
  localId: "waypoint-1",
  longitude: 19,
  note: null,
  segmentLocalId: "old-segment",
  serverId: null,
  syncStatus: "synced",
  title: "Waypoint",
  tripLocalId: "trip-1",
  updatedAt: "2026-06-02T09:03:00.000Z",
  userId: "user-1",
};

const rawEvents: RawLocationEvent[] = [
  {
    acceptedTripPointLocalId: null,
    accuracy: 8,
    activeSegmentLocalId: "old-segment",
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
  },
  {
    acceptedTripPointLocalId: null,
    accuracy: 8,
    activeSegmentLocalId: "old-segment",
    altitude: null,
    batchId: "batch-1",
    batchIndex: 1,
    callbackSource: "background",
    latitude: 45.01,
    localId: "raw-2",
    longitude: 19.01,
    origin: "device",
    processedAt: null,
    processingDecision: null,
    processingStatus: "pending",
    receivedAt: "2026-06-02T09:02:00.000Z",
    recordedAt: "2026-06-02T09:02:00.000Z",
    segmentLocalId: null,
    sessionStartedAt: "2026-06-02T09:00:00.000Z",
    speed: 12,
    tripLocalId: "trip-1",
  },
];

describe("raw event reprocessing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadTrips).mockResolvedValue([trip]);
    vi.mocked(loadTripSegments).mockResolvedValue([oldSegment]);
    vi.mocked(loadWaypoints).mockResolvedValue([waypoint]);
    vi.mocked(loadTripPointsForTrip).mockResolvedValue([oldPoint]);
    vi.mocked(loadRawLocationEventsForTrip).mockResolvedValue(rawEvents);
  });

  it("previews raw replay without writing", async () => {
    const preview = await previewRawEventReprocessing("trip-1");

    expect(preview.rawEventCount).toBe(2);
    expect(preview.oldPointCount).toBe(1);
    expect(preview.newPointCount).toBe(2);
    expect(preview.newSegmentCount).toBe(1);
    expect(saveTrips).not.toHaveBeenCalled();
    expect(saveTripSegments).not.toHaveBeenCalled();
    expect(replaceTripPointsForTrip).not.toHaveBeenCalled();
    expect(saveWaypoints).not.toHaveBeenCalled();
    expect(updateRawLocationEventProcessingResults).not.toHaveBeenCalled();
  });

  it("applies raw replay to trip recording data", async () => {
    await applyRawEventReprocessing("trip-1");

    expect(saveTrips).toHaveBeenCalled();
    expect(saveTripSegments).toHaveBeenCalled();
    expect(replaceTripPointsForTrip).toHaveBeenCalledWith(
      "trip-1",
      expect.arrayContaining([
        expect.objectContaining({
          recordedAt: "2026-06-02T09:01:00.000Z",
          segmentLocalId: "reprocessed-segment-trip-1-1",
        }),
      ]),
    );
    expect(saveWaypoints).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          localId: "waypoint-1",
          segmentLocalId: "reprocessed-segment-trip-1-1",
          syncStatus: "pending-sync",
        }),
      ]),
      [waypoint],
    );
    expect(updateRawLocationEventProcessingResults).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          localId: "raw-1",
          processingStatus: "accepted",
          segmentLocalId: "reprocessed-segment-trip-1-1",
        }),
      ]),
    );
  });
});
