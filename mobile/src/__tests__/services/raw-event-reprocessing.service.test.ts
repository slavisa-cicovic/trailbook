import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RawLocationEvent } from "../../domain/raw-location-event";
import type { RecordingSessionSummary, Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import type { RawReprocessingInputModel } from "../../repositories/reprocessing-repository";
import {
  applyRawEventReprocessing,
  buildRawReprocessingPreview,
  previewRawEventReprocessing,
} from "../../services/recording/raw-event-reprocessing.service";
import {
  updateRawLocationEventProcessingResults,
} from "../../storage/raw-location-events-storage";
import { replaceTripPointsForTrip } from "../../storage/trip-points-storage";
import { loadTripSegments, saveTripSegments } from "../../storage/trip-segments-storage";
import { loadTrips, saveTrips } from "../../storage/trips-storage";
import { loadWaypoints, saveWaypoints } from "../../storage/waypoints-storage";

vi.mock("../../repositories/reprocessing-repository", () => ({
  loadRawReprocessingInputModel: vi.fn(),
}));

vi.mock("../../storage/raw-location-events-storage", () => ({
  updateRawLocationEventProcessingResults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/trip-points-storage", () => ({
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

vi.mock("../../services/trips/trip-distance.service", () => ({
  calculateTripDistanceMeters: vi.fn((tripPoints) => Math.max(0, tripPoints.length - 1) * 100),
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

const validInputModel: RawReprocessingInputModel = {
  oldTripPoints: [oldPoint],
  rawEvents,
  recordingSession: idleSession,
  trip,
  tripSegments: [oldSegment],
  waypoints: [waypoint],
};

describe("raw event reprocessing", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");
    const { appendTripPointIfUseful } = await import("../../services/trip-points/trip-points.service");

    vi.mocked(loadRawReprocessingInputModel).mockResolvedValue(validInputModel);
    vi.mocked(appendTripPointIfUseful).mockImplementation(
      (tripPoints, nextTripPoint) => [...tripPoints, nextTripPoint],
    );

    vi.mocked(loadTrips).mockResolvedValue([trip]);
    vi.mocked(loadTripSegments).mockResolvedValue([oldSegment]);
    vi.mocked(loadWaypoints).mockResolvedValue([waypoint]);
  });

  describe("previewRawEventReprocessing", () => {
    it("previews raw replay without writing", async () => {
      const preview = await previewRawEventReprocessing("trip-1");

      expect(preview.rawEventCount).toBe(2);
      expect(preview.oldPointCount).toBe(1);
      expect(preview.newPointCount).toBe(2);
      expect(preview.newSegmentCount).toBe(1);
      expect(preview.processingTrace).toMatchObject({
        acceptedPointCount: 2,
        callbackSource: "reprocess",
        inputSnapshotCount: 2,
        origin: "device",
        previousProfile: "walk",
        processingMode: "reprocess",
        rawInsertedCount: 2,
        rejectedPointCount: 0,
        tripLocalId: "trip-1",
      });
      expect(saveTrips).not.toHaveBeenCalled();
      expect(saveTripSegments).not.toHaveBeenCalled();
      expect(replaceTripPointsForTrip).not.toHaveBeenCalled();
      expect(saveWaypoints).not.toHaveBeenCalled();
      expect(updateRawLocationEventProcessingResults).not.toHaveBeenCalled();
    });

    it("throws when trip is not found", async () => {
      const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");

      vi.mocked(loadRawReprocessingInputModel).mockResolvedValue(null);

      await expect(previewRawEventReprocessing("missing-trip")).rejects.toThrow("Trip was not found.");
    });

    it("throws when trip is active (cannot be reprocessed)", async () => {
      const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");

      vi.mocked(loadRawReprocessingInputModel).mockResolvedValue({
        ...validInputModel,
        trip: { ...trip, status: "active", endedAt: null },
      });

      await expect(previewRawEventReprocessing("trip-1")).rejects.toThrow(
        "Only ended inactive trips can be reprocessed.",
      );
    });

    it("throws when recording session is active on the same trip", async () => {
      const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");

      vi.mocked(loadRawReprocessingInputModel).mockResolvedValue({
        ...validInputModel,
        recordingSession: {
          ...idleSession,
          activeTripId: "trip-1",
          status: "recording",
        },
      });

      await expect(previewRawEventReprocessing("trip-1")).rejects.toThrow(
        "Only ended inactive trips can be reprocessed.",
      );
    });
  });

  describe("buildRawReprocessingPreview", () => {
    it("builds preview from input model without storage", () => {
      const result = buildRawReprocessingPreview(validInputModel);

      expect(result.preview.rawEventCount).toBe(2);
      expect(result.preview.oldPointCount).toBe(1);
      expect(result.preview.newPointCount).toBe(2);
      expect(result.preview.tripLocalId).toBe("trip-1");
      expect(result.tripPoints).toHaveLength(2);
      expect(result.tripSegments).toHaveLength(1);
    });

    it("throws when input model has no raw events", () => {
      expect(() =>
        buildRawReprocessingPreview({ ...validInputModel, rawEvents: [] }),
      ).toThrow("This trip has no local raw location events.");
    });

    it("remaps waypoint to new segment", () => {
      const result = buildRawReprocessingPreview(validInputModel);
      const remappedWaypoint = result.nextWaypoints.find((wp) => wp.localId === "waypoint-1");

      expect(remappedWaypoint?.segmentLocalId).toBe("reprocessed-segment-trip-1-1");
      expect(remappedWaypoint?.syncStatus).toBe("pending-sync");
    });
  });

  describe("applyRawEventReprocessing", () => {
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

    it("throws when reprocessing produces zero points", async () => {
      const { loadRawReprocessingInputModel } = await import("../../repositories/reprocessing-repository");
      const { appendTripPointIfUseful } = await import("../../services/trip-points/trip-points.service");

      vi.mocked(loadRawReprocessingInputModel).mockResolvedValue({
        ...validInputModel,
        oldTripPoints: [oldPoint],
      });
      vi.mocked(appendTripPointIfUseful).mockImplementation(() => []);

      await expect(applyRawEventReprocessing("trip-1")).rejects.toThrow(
        "Reprocessing produced zero accepted points.",
      );
    });
  });
});
