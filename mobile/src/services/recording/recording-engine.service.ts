import * as Crypto from "expo-crypto";
import type * as Location from "expo-location";

import type {
  RawLocationEvent,
  RawLocationEventOrigin,
  RawLocationEventProcessingResult,
} from "../../domain/raw-location-event";
import type { TripPoint } from "../../domain/trips";
import { loadRecordingSession } from "../../storage/recording-storage";
import {
  insertRawLocationEvents,
  updateRawLocationEventProcessingResults,
} from "../../repositories/raw-location-events-repository";
import {
  loadTripPointsForTrip,
} from "../../repositories/trip-points-repository";
import { toSnapshot, type CurrentLocationSnapshot } from "../location/location.service";
import type { LocationCallbackSource } from "../trip-points/trip-point-diagnostics.service";
import {
  processRecordedLocationSnapshots,
  type PersistRecordedLocationOptions,
  type RecordingPipelineResult,
} from "./recording-pipeline.service";
import { buildRawLocationEventProcessingResults } from "./raw-location-event-processing.service";
import { recordRecordingNativeEvent } from "./recording-native-events.service";
import {
  countRawProcessingResults,
  recordRecordingProcessingTrace,
  type RecordingProcessingTrace,
} from "./recording-processing-trace.service";

function formatRawLocationCoordinate(value: number): string {
  return value.toFixed(7);
}

function getRawLocationEventLocalId(input: {
  origin: RawLocationEventOrigin;
  snapshot: CurrentLocationSnapshot;
  tripLocalId: string;
}) {
  return [
    "raw-location",
    input.tripLocalId,
    input.origin,
    input.snapshot.recordedAt,
    formatRawLocationCoordinate(input.snapshot.latitude),
    formatRawLocationCoordinate(input.snapshot.longitude),
  ]
    .map(encodeURIComponent)
    .join("-");
}

function buildRawLocationEvents(input: {
  activeSegmentLocalId: string | null;
  batchId: string;
  batchIndexes?: number[];
  callbackSource: LocationCallbackSource;
  origin: RawLocationEventOrigin;
  receivedAt: string;
  sessionStartedAt: string | null;
  snapshots: CurrentLocationSnapshot[];
  tripLocalId: string;
}): RawLocationEvent[] {
  const rawEvents: RawLocationEvent[] = [];
  const seenLocalIds = new Set<string>();

  input.snapshots.forEach((snapshot, index) => {
    const localId = getRawLocationEventLocalId({
      origin: input.origin,
      snapshot,
      tripLocalId: input.tripLocalId,
    });

    if (seenLocalIds.has(localId)) {
      return;
    }

    seenLocalIds.add(localId);
    rawEvents.push({
      acceptedTripPointLocalId: null,
      accuracy: snapshot.accuracy,
      activeSegmentLocalId: input.activeSegmentLocalId,
      altitude: snapshot.altitude,
      batchId: input.batchId,
      batchIndex: input.batchIndexes?.[index] ?? index,
      callbackSource: input.callbackSource,
      latitude: snapshot.latitude,
      localId,
      longitude: snapshot.longitude,
      origin: input.origin,
      processedAt: null,
      processingDecision: null,
      processingStatus: "pending",
      receivedAt: input.receivedAt,
      recordedAt: snapshot.recordedAt,
      segmentLocalId: null,
      sessionStartedAt: input.sessionStartedAt,
      speed: snapshot.speed,
      tripLocalId: input.tripLocalId,
    });
  });

  return rawEvents;
}

function dedupeLocationSnapshotsForTrip(input: {
  origin: RawLocationEventOrigin;
  snapshots: CurrentLocationSnapshot[];
  tripLocalId: string;
}): { batchIndexes: number[]; snapshots: CurrentLocationSnapshot[] } {
  const seenLocalIds = new Set<string>();
  const dedupedSnapshots: CurrentLocationSnapshot[] = [];
  const batchIndexes: number[] = [];

  input.snapshots.forEach((snapshot, index) => {
    const localId = getRawLocationEventLocalId({
      origin: input.origin,
      snapshot,
      tripLocalId: input.tripLocalId,
    });

    if (seenLocalIds.has(localId)) {
      return;
    }

    seenLocalIds.add(localId);
    dedupedSnapshots.push(snapshot);
    batchIndexes.push(index);
  });

  return {
    batchIndexes,
    snapshots: dedupedSnapshots,
  };
}

function withRawProcessingTrace(input: {
  batchId: string | null;
  pipelineResult: RecordingPipelineResult;
  processingResults: RawLocationEventProcessingResult[];
  rawInsertedCount: number;
}): RecordingProcessingTrace {
  const acceptedRawCount = countRawProcessingResults(input.processingResults, "accepted");
  const duplicateRawCount = countRawProcessingResults(input.processingResults, "duplicate");
  const rejectedRawCount = countRawProcessingResults(input.processingResults, "rejected");

  return {
    ...input.pipelineResult.processingTrace,
    acceptedPointCount: input.processingResults.length > 0
      ? acceptedRawCount
      : input.pipelineResult.acceptedPointCount,
    batchId: input.batchId,
    duplicateRawEventCount: duplicateRawCount,
    rawInsertedCount: input.rawInsertedCount,
    rejectedPointCount: input.processingResults.length > 0
      ? rejectedRawCount
      : input.pipelineResult.rejectedPointCount,
    rejectedRawEventCount: rejectedRawCount,
  };
}

export async function recordLocationSnapshots(
  snapshots: CurrentLocationSnapshot[],
  callbackSource: LocationCallbackSource,
  options: PersistRecordedLocationOptions = {},
): Promise<void> {
  if (snapshots.length === 0) {
    return;
  }

  const recordingSession = await loadRecordingSession();
  const activeTripId =
    recordingSession?.status === "recording" && recordingSession.activeTripId
      ? recordingSession.activeTripId
      : null;
  const origin = options.origin ?? "device";
  let batchId: string | null = null;
  let rawEvents: RawLocationEvent[] = [];
  let beforeTripPoints: TripPoint[] = [];
  let pipelineSnapshots = snapshots;

  if (activeTripId) {
    batchId = Crypto.randomUUID();
    const receivedAt = new Date().toISOString();
    const dedupedLocationSnapshots = dedupeLocationSnapshotsForTrip({
      origin,
      snapshots,
      tripLocalId: activeTripId,
    });
    pipelineSnapshots = dedupedLocationSnapshots.snapshots;

    rawEvents = buildRawLocationEvents({
      activeSegmentLocalId: recordingSession?.activeSegmentId ?? null,
      batchId,
      batchIndexes: dedupedLocationSnapshots.batchIndexes,
      callbackSource,
      origin,
      receivedAt,
      sessionStartedAt: recordingSession?.startedAt ?? null,
      snapshots: pipelineSnapshots,
      tripLocalId: activeTripId,
    });
    void recordRecordingNativeEvent({
      eventType: snapshots.length > 1 ? "native_location_batch" : "native_location_callback",
      payload: {
        activeSegmentLocalId: recordingSession?.activeSegmentId ?? null,
        batchId,
        callbackSource,
        dedupedLocationCount: pipelineSnapshots.length,
        firstRecordedAt: snapshots[0]?.recordedAt ?? null,
        lastRecordedAt: snapshots[snapshots.length - 1]?.recordedAt ?? null,
        locationCount: snapshots.length,
        origin,
      },
      tripLocalId: activeTripId,
    });

    beforeTripPoints = await loadTripPointsForTrip(activeTripId).catch(() => []);

    rawEvents = await insertRawLocationEvents(rawEvents).catch((error) => {
      console.warn("[Trailbook][recording-engine]", {
        error: error instanceof Error ? error.message : String(error),
        step: "raw-insert-failed",
        tripLocalId: activeTripId,
      });
      return [];
    });
  }

  const pipelineResult = await processRecordedLocationSnapshots(pipelineSnapshots, callbackSource, options);

  if (!activeTripId) {
    return;
  }

  let processingResults: RawLocationEventProcessingResult[] = [];

  if (rawEvents.length === 0) {
    void recordRecordingProcessingTrace(
      withRawProcessingTrace({
        batchId,
        pipelineResult,
        processingResults,
        rawInsertedCount: rawEvents.length,
      }),
    );
    return;
  }

  const afterTripPoints = await loadTripPointsForTrip(activeTripId).catch(() => beforeTripPoints);
  processingResults = buildRawLocationEventProcessingResults({
    acceptedDecision: "accepted-by-recording-pipeline",
    afterTripPoints,
    beforeTripPoints,
    rawEvents,
    rejectedDecision: "filtered-by-recording-pipeline",
  });

  await updateRawLocationEventProcessingResults(processingResults).catch((error) => {
    console.warn("[Trailbook][recording-engine]", {
      error: error instanceof Error ? error.message : String(error),
      step: "raw-status-update-failed",
      tripLocalId: activeTripId,
    });
  });
  void recordRecordingProcessingTrace(
    withRawProcessingTrace({
      batchId,
      pipelineResult,
      processingResults,
      rawInsertedCount: rawEvents.length,
    }),
  );
}

export function persistBackgroundRecordedLocations(
  locations: Location.LocationObject[],
  options: PersistRecordedLocationOptions = {},
): Promise<void> {
  return recordLocationSnapshots(locations.map(toSnapshot), "background", options);
}
