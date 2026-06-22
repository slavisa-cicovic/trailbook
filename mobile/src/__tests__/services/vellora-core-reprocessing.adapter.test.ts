import { describe, expect, it } from "vitest";

import type { RawLocationEvent } from "../../domain/raw-location-event";
import type { Trip } from "../../domain/trips";
import type { RawReprocessingInputModel } from "../../repositories/reprocessing-repository";
import { processLegacyInputWithVelloraCore } from "../../services/recording/vellora-core-reprocessing.adapter";

function createTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    batteryEndLevelPercent: null,
    batteryEndState: null,
    batteryStartLevelPercent: null,
    batteryStartState: null,
    createdAt: "2026-01-01T10:00:00.000Z",
    deletedAt: null,
    description: null,
    deviceId: "device-1",
    distanceMeters: null,
    endedAt: "2026-01-01T10:03:00.000Z",
    localId: "trip-1",
    pointCount: null,
    recordingConfig: null,
    recordingProfile: "walk",
    serverId: null,
    startedAt: "2026-01-01T10:00:00.000Z",
    statsUpdatedAt: null,
    status: "ended",
    syncStatus: "synced",
    title: "Test trip",
    updatedAt: "2026-01-01T10:03:00.000Z",
    userId: "user-1",
    ...overrides,
  };
}

function createRawEvent(index: number, speed: number, recordedAt: string): RawLocationEvent {
  return {
    acceptedTripPointLocalId: null,
    accuracy: 5,
    activeSegmentLocalId: null,
    altitude: null,
    batchId: "batch-1",
    batchIndex: index,
    callbackSource: "background",
    latitude: 45 + index * 0.001,
    localId: `raw-${index}`,
    longitude: 19 + index * 0.001,
    origin: "device",
    processedAt: null,
    processingDecision: null,
    processingStatus: "pending",
    receivedAt: recordedAt,
    recordedAt,
    segmentLocalId: null,
    sessionStartedAt: "2026-01-01T10:00:00.000Z",
    speed,
    tripLocalId: "trip-1",
  };
}

function createInputModel(rawEvents: RawLocationEvent[]): RawReprocessingInputModel {
  return {
    oldTripPoints: [],
    rawEvents,
    recordingSession: null,
    trip: createTrip(),
    tripSegments: [],
    waypoints: [],
  };
}

describe("vellora core reprocessing adapter", () => {
  it("returns legacy trip points and segments from raw events", () => {
    const output = processLegacyInputWithVelloraCore(
      createInputModel([
        createRawEvent(0, 1.2, "2026-01-01T10:00:00.000Z"),
        createRawEvent(1, 1.3, "2026-01-01T10:01:00.000Z"),
        createRawEvent(2, 12, "2026-01-01T10:02:00.000Z"),
        createRawEvent(3, 13, "2026-01-01T10:03:00.000Z"),
      ]),
    );

    expect(output.bundle.trip.clientTripId).toBe("trip-1");
    expect(output.tripPoints).toHaveLength(4);
    expect(output.tripSegments.length).toBeGreaterThanOrEqual(1);
    expect(output.processingResults.filter((result) => result.processingStatus === "accepted")).toHaveLength(4);
  });
});
