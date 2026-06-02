import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripPoint } from "../../domain/trips";
import { recordLocationSnapshots } from "../../services/recording/recording-engine.service";
import { processRecordedLocationSnapshots } from "../../services/recording/recording-pipeline.service";
import { insertRawLocationEvents, updateRawLocationEventProcessingResults } from "../../storage/raw-location-events-storage";
import {
  loadTripPointsForTrip,
  refreshTripSegmentStatsForTripLocalId,
  refreshTripStatsForTripLocalId,
} from "../../storage/trip-points-storage";

vi.mock("expo-crypto", () => ({
  randomUUID: vi.fn(() => "batch-1"),
}));

vi.mock("../../services/location/location.service", () => ({
  toSnapshot: vi.fn(),
}));

vi.mock("../../storage/recording-storage", () => ({
  loadRecordingSession: vi.fn().mockResolvedValue({
    activeSegmentId: "segment-1",
    activeTripId: "trip-1",
    startedAt: "2026-06-02T09:00:00.000Z",
    status: "recording",
  }),
}));

vi.mock("../../storage/raw-location-events-storage", () => ({
  insertRawLocationEvents: vi.fn().mockResolvedValue(undefined),
  updateRawLocationEventProcessingResults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/trip-points-storage", () => ({
  loadTripPointsForTrip: vi.fn(),
  refreshTripSegmentStatsForTripLocalId: vi.fn().mockResolvedValue(undefined),
  refreshTripStatsForTripLocalId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/recording/recording-pipeline.service", () => ({
  processRecordedLocationSnapshots: vi.fn().mockResolvedValue(undefined),
}));

const acceptedTripPoint: TripPoint = {
  accuracy: 6,
  altitude: null,
  deviceId: "device-1",
  latitude: 45,
  localId: "point-1",
  longitude: 19,
  recordedAt: "2026-06-02T09:01:00.000Z",
  segmentLocalId: "segment-1",
  serverId: null,
  speed: 3,
  syncStatus: "local-only",
  tripLocalId: "trip-1",
  userId: "user-1",
};

describe("recording engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadTripPointsForTrip)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([acceptedTripPoint]);
  });

  it("stores raw events before pipeline processing and records processing results", async () => {
    await recordLocationSnapshots(
      [
        {
          accuracy: 6,
          altitude: null,
          latitude: 45,
          longitude: 19,
          recordedAt: "2026-06-02T09:01:00.000Z",
          speed: 3,
        },
        {
          accuracy: 6,
          altitude: null,
          latitude: 45,
          longitude: 19,
          recordedAt: "2026-06-02T09:01:00.000Z",
          speed: 3,
        },
        {
          accuracy: 6,
          altitude: null,
          latitude: 45.1,
          longitude: 19.1,
          recordedAt: "2026-06-02T09:02:00.000Z",
          speed: 3,
        },
      ],
      "background",
    );

    expect(insertRawLocationEvents).toHaveBeenCalledTimes(1);
    expect(processRecordedLocationSnapshots).toHaveBeenCalledTimes(1);
    expect(updateRawLocationEventProcessingResults).toHaveBeenCalledTimes(1);
    expect(vi.mocked(insertRawLocationEvents).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(processRecordedLocationSnapshots).mock.invocationCallOrder[0],
    );

    const rawEvents = vi.mocked(insertRawLocationEvents).mock.calls[0]?.[0] ?? [];

    expect(rawEvents).toHaveLength(3);
    expect(rawEvents[0]).toMatchObject({
      activeSegmentLocalId: "segment-1",
      batchId: "batch-1",
      callbackSource: "background",
      localId: "raw-location-batch-1-0",
      origin: "device",
      processingStatus: "pending",
      tripLocalId: "trip-1",
    });

    expect(vi.mocked(updateRawLocationEventProcessingResults).mock.calls[0]?.[0]).toEqual([
      {
        acceptedTripPointLocalId: "point-1",
        localId: "raw-location-batch-1-0",
        processedAt: expect.any(String),
        processingDecision: "accepted-by-recording-pipeline",
        processingStatus: "accepted",
        segmentLocalId: "segment-1",
      },
      {
        acceptedTripPointLocalId: null,
        localId: "raw-location-batch-1-1",
        processedAt: expect.any(String),
        processingDecision: "duplicate-recorded-at",
        processingStatus: "duplicate",
        segmentLocalId: null,
      },
      {
        acceptedTripPointLocalId: null,
        localId: "raw-location-batch-1-2",
        processedAt: expect.any(String),
        processingDecision: "filtered-by-recording-pipeline",
        processingStatus: "rejected",
        segmentLocalId: null,
      },
    ]);
    expect(refreshTripSegmentStatsForTripLocalId).toHaveBeenCalledWith("trip-1");
    expect(refreshTripStatsForTripLocalId).toHaveBeenCalledWith("trip-1");
  });
});
