import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripPoint } from "../../domain/trips";
import { recordLocationSnapshots } from "../../services/recording/recording-engine.service";
import { processRecordedLocationSnapshots } from "../../services/recording/recording-pipeline.service";
import { appendDiagnosticEvent } from "../../repositories/diagnostic-events-repository";
import { insertRawLocationEvents, updateRawLocationEventProcessingResults } from "../../storage/raw-location-events-storage";
import {
  loadTripPointsForTrip,
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
  insertRawLocationEvents: vi.fn(async (events) => events),
  updateRawLocationEventProcessingResults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/trip-points-storage", () => ({
  loadTripPointsForTrip: vi.fn(),
  refreshTripSegmentStatsForTripLocalId: vi.fn().mockResolvedValue(undefined),
  refreshTripStatsForTripLocalId: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/recording/recording-pipeline.service", () => ({
  processRecordedLocationSnapshots: vi.fn().mockResolvedValue({
    acceptedPointCount: 1,
    duplicateRecordedAtCount: 1,
    processingTrace: {
      acceptedPointCount: 1,
      activeProfile: "walk",
      batchId: null,
      callbackSource: "background",
      duplicateRawEventCount: 0,
      duplicateRecordedAtCount: 1,
      firstRecordedAt: "2026-06-02T09:01:00.000Z",
      inferredProfile: null,
      inputSnapshotCount: 3,
      lastRecordedAt: "2026-06-02T09:02:00.000Z",
      maxAcceptedGapMs: 0,
      maxRawGapMs: 60000,
      origin: "device",
      previousProfile: "walk",
      processingMode: "live",
      processedAt: "2026-06-02T09:02:01.000Z",
      rawInsertedCount: 0,
      recoveredPointCount: 0,
      rejectedPointCount: 1,
      rejectedRawEventCount: 0,
      sortedSnapshotCount: 3,
      transitionAt: null,
      transitionChanged: false,
      tripLocalId: "trip-1",
    },
    recoveredPointCount: 0,
    rejectedPointCount: 1,
  }),
}));

vi.mock("../../services/recording/recording-native-events.service", () => ({
  recordRecordingNativeEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../repositories/diagnostic-events-repository", () => ({
  appendDiagnosticEvent: vi.fn().mockResolvedValue(undefined),
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

  it("stores deduped raw events before pipeline processing and records processing results", async () => {
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
    expect(vi.mocked(processRecordedLocationSnapshots).mock.calls[0]?.[0]).toHaveLength(2);
    expect(updateRawLocationEventProcessingResults).toHaveBeenCalledTimes(1);
    expect(vi.mocked(insertRawLocationEvents).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(processRecordedLocationSnapshots).mock.invocationCallOrder[0],
    );

    const rawEvents = vi.mocked(insertRawLocationEvents).mock.calls[0]?.[0] ?? [];

    expect(rawEvents).toHaveLength(2);
    expect(rawEvents[0]).toMatchObject({
      activeSegmentLocalId: "segment-1",
      batchId: "batch-1",
      batchIndex: 0,
      callbackSource: "background",
      localId: "raw-location-trip-1-device-2026-06-02T09%3A01%3A00.000Z-45.0000000-19.0000000",
      origin: "device",
      processingStatus: "pending",
      tripLocalId: "trip-1",
    });
    expect(rawEvents[1]).toMatchObject({
      batchIndex: 2,
      localId: "raw-location-trip-1-device-2026-06-02T09%3A02%3A00.000Z-45.1000000-19.1000000",
    });

    expect(vi.mocked(updateRawLocationEventProcessingResults).mock.calls[0]?.[0]).toEqual([
      {
        acceptedTripPointLocalId: "point-1",
        localId: "raw-location-trip-1-device-2026-06-02T09%3A01%3A00.000Z-45.0000000-19.0000000",
        processedAt: expect.any(String),
        processingDecision: "accepted-by-recording-pipeline",
        processingStatus: "accepted",
        segmentLocalId: "segment-1",
      },
      {
        acceptedTripPointLocalId: null,
        localId: "raw-location-trip-1-device-2026-06-02T09%3A02%3A00.000Z-45.1000000-19.1000000",
        processedAt: expect.any(String),
        processingDecision: "filtered-by-recording-pipeline",
        processingStatus: "rejected",
        segmentLocalId: null,
      },
    ]);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(appendDiagnosticEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "recording",
        name: "processing_trace",
        payload: expect.objectContaining({
          acceptedPointCount: 1,
          batchId: "batch-1",
          duplicateRawEventCount: 0,
          rawInsertedCount: 2,
          rejectedPointCount: 1,
          rejectedRawEventCount: 1,
        }),
        tripLocalId: "trip-1",
      }),
    );
  });

  it("does not update raw processing status for storage-ignored duplicate raw events", async () => {
    vi.mocked(insertRawLocationEvents).mockResolvedValueOnce([]);
    vi.mocked(loadTripPointsForTrip).mockReset();
    vi.mocked(loadTripPointsForTrip).mockResolvedValue([acceptedTripPoint]);

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
      ],
      "background",
    );

    expect(processRecordedLocationSnapshots).toHaveBeenCalledTimes(1);
    expect(updateRawLocationEventProcessingResults).not.toHaveBeenCalled();
  });
});
