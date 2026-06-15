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

function getTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestampMs = new Date(value).getTime();

  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function isBeforeSessionStartSnapshot(input: {
  origin: RawLocationEventOrigin;
  sessionStartedAt: string | null;
  snapshot: CurrentLocationSnapshot;
}): boolean {
  if (input.origin !== "device") {
    return false;
  }

  const sessionStartedAtMs = getTimestampMs(input.sessionStartedAt);
  const recordedAtMs = getTimestampMs(input.snapshot.recordedAt);

  return sessionStartedAtMs !== null && recordedAtMs !== null && recordedAtMs < sessionStartedAtMs;
}

function getMaxDeliveryLagMs(input: {
  receivedAt: string;
  snapshots: CurrentLocationSnapshot[];
}): number {
  const receivedAtMs = getTimestampMs(input.receivedAt);

  if (receivedAtMs === null) {
    return 0;
  }

  return input.snapshots.reduce((maxLagMs, snapshot) => {
    const recordedAtMs = getTimestampMs(snapshot.recordedAt);

    if (recordedAtMs === null) {
      return maxLagMs;
    }

    return Math.max(maxLagMs, Math.max(0, receivedAtMs - recordedAtMs));
  }, 0);
}

function withRawProcessingTrace(input: {
  batchId: string | null;
  durationMs?: number;
  ignoredBeforeSessionStartRawEventCount?: number;
  phaseDurationsMs?: Record<string, number>;
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
    durationMs: input.durationMs,
    duplicateRawEventCount: duplicateRawCount,
    phaseDurationsMs: input.phaseDurationsMs,
    ignoredBeforeSessionStartRawEventCount: input.ignoredBeforeSessionStartRawEventCount,
    rawInsertedCount: input.rawInsertedCount,
    rejectedPointCount: input.processingResults.length > 0
      ? rejectedRawCount
      : input.pipelineResult.rejectedPointCount,
    rejectedRawEventCount: rejectedRawCount,
  };
}

function maybeLogBatchPerformance(input: {
  activeTripId: string;
  durationMs: number;
  phaseDurationsMs: Record<string, number>;
  rawEventCount: number;
  snapshotCount: number;
}) {
  if (input.snapshotCount < 10 && input.durationMs < 1_000) {
    return;
  }

  console.warn("[Trailbook][recording-batch-performance]", {
    durationMs: input.durationMs,
    phaseDurationsMs: input.phaseDurationsMs,
    rawEventCount: input.rawEventCount,
    snapshotCount: input.snapshotCount,
    tripLocalId: input.activeTripId,
  });
}

export async function recordLocationSnapshots(
  snapshots: CurrentLocationSnapshot[],
  callbackSource: LocationCallbackSource,
  options: PersistRecordedLocationOptions = {},
): Promise<void> {
  if (snapshots.length === 0) {
    return;
  }

  const startedAtMs = Date.now();
  const phaseDurationsMs: Record<string, number> = {};

  async function measurePhase<T>(phaseName: string, callback: () => Promise<T>): Promise<T> {
    const phaseStartedAtMs = Date.now();

    try {
      return await callback();
    } finally {
      phaseDurationsMs[phaseName] = (phaseDurationsMs[phaseName] ?? 0) + (Date.now() - phaseStartedAtMs);
    }
  }

  function measureSyncPhase<T>(phaseName: string, callback: () => T): T {
    const phaseStartedAtMs = Date.now();

    try {
      return callback();
    } finally {
      phaseDurationsMs[phaseName] = (phaseDurationsMs[phaseName] ?? 0) + (Date.now() - phaseStartedAtMs);
    }
  }

  const recordingSession = await measurePhase("load-recording-session", loadRecordingSession);
  const activeTripId =
    recordingSession?.status === "recording" && recordingSession.activeTripId
      ? recordingSession.activeTripId
      : null;
  const origin = options.origin ?? "device";
  let batchId: string | null = null;
  let ignoredBeforeSessionStartRawEventCount = 0;
  const ignoredBeforeSessionStartRawEventLocalIds = new Set<string>();
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
    const sessionStartedAt = recordingSession?.startedAt ?? null;
    pipelineSnapshots = dedupedLocationSnapshots.snapshots.filter((snapshot) => {
      if (!isBeforeSessionStartSnapshot({ origin, sessionStartedAt, snapshot })) {
        return true;
      }

      ignoredBeforeSessionStartRawEventLocalIds.add(
        getRawLocationEventLocalId({
          origin,
          snapshot,
          tripLocalId: activeTripId,
        }),
      );
      return false;
    });
    ignoredBeforeSessionStartRawEventCount = ignoredBeforeSessionStartRawEventLocalIds.size;

    rawEvents = buildRawLocationEvents({
      activeSegmentLocalId: recordingSession?.activeSegmentId ?? null,
      batchId,
      batchIndexes: dedupedLocationSnapshots.batchIndexes,
      callbackSource,
      origin,
      receivedAt,
      sessionStartedAt,
      snapshots: dedupedLocationSnapshots.snapshots,
      tripLocalId: activeTripId,
    });
    void recordRecordingNativeEvent({
      eventType: snapshots.length > 1 ? "native_location_batch" : "native_location_callback",
      payload: {
        activeSegmentLocalId: recordingSession?.activeSegmentId ?? null,
        batchId,
        callbackSource,
        dedupedLocationCount: dedupedLocationSnapshots.snapshots.length,
        ignoredBeforeSessionStartCount: ignoredBeforeSessionStartRawEventCount,
        firstRecordedAt: snapshots[0]?.recordedAt ?? null,
        lastRecordedAt: snapshots[snapshots.length - 1]?.recordedAt ?? null,
        locationCount: snapshots.length,
        maxDeliveryLagMs: getMaxDeliveryLagMs({ receivedAt, snapshots }),
        origin,
        pipelineLocationCount: pipelineSnapshots.length,
        rawLocationCount: dedupedLocationSnapshots.snapshots.length,
      },
      tripLocalId: activeTripId,
    });

    beforeTripPoints = await measurePhase(
      "load-before-trip-points",
      () => loadTripPointsForTrip(activeTripId),
    ).catch(() => []);

    rawEvents = await measurePhase(
      "insert-raw-events",
      () => insertRawLocationEvents(rawEvents),
    ).catch((error) => {
      console.warn("[Trailbook][recording-engine]", {
        error: error instanceof Error ? error.message : String(error),
        step: "raw-insert-failed",
        tripLocalId: activeTripId,
      });
      return [];
    });
  }

  const pipelineResult = await measurePhase(
    "process-recording-pipeline",
    () => processRecordedLocationSnapshots(pipelineSnapshots, callbackSource, options),
  );

  if (!activeTripId) {
    return;
  }

  let processingResults: RawLocationEventProcessingResult[] = [];

  if (rawEvents.length === 0) {
    maybeLogBatchPerformance({
      activeTripId,
      durationMs: Date.now() - startedAtMs,
      phaseDurationsMs,
      rawEventCount: rawEvents.length,
      snapshotCount: snapshots.length,
    });
    void recordRecordingProcessingTrace(
      withRawProcessingTrace({
        batchId,
        durationMs: Date.now() - startedAtMs,
        ignoredBeforeSessionStartRawEventCount,
        phaseDurationsMs,
        pipelineResult,
        processingResults,
        rawInsertedCount: rawEvents.length,
      }),
    );
    return;
  }

  const afterTripPoints = await measurePhase(
    "load-after-trip-points",
    () => loadTripPointsForTrip(activeTripId),
  ).catch(() => beforeTripPoints);
  processingResults = measureSyncPhase(
    "build-raw-processing-results",
    () => buildRawLocationEventProcessingResults({
      acceptedDecision: "accepted-by-recording-pipeline",
      afterTripPoints,
      beforeTripPoints,
      rawEvents,
      rejectedDecision: "filtered-by-recording-pipeline",
    }),
  );

  if (ignoredBeforeSessionStartRawEventLocalIds.size > 0) {
    const processedAt = new Date().toISOString();
    processingResults = processingResults.map((result) => {
      if (!ignoredBeforeSessionStartRawEventLocalIds.has(result.localId)) {
        return result;
      }

      return {
        acceptedTripPointLocalId: null,
        localId: result.localId,
        processedAt,
        processingDecision: "ignored-before-session-start",
        processingStatus: "rejected",
        segmentLocalId: null,
      };
    });
  }

  await measurePhase(
    "update-raw-processing-results",
    () => updateRawLocationEventProcessingResults(processingResults),
  ).catch((error) => {
    console.warn("[Trailbook][recording-engine]", {
      error: error instanceof Error ? error.message : String(error),
      step: "raw-status-update-failed",
      tripLocalId: activeTripId,
    });
  });
  maybeLogBatchPerformance({
    activeTripId,
    durationMs: Date.now() - startedAtMs,
    phaseDurationsMs,
    rawEventCount: rawEvents.length,
    snapshotCount: snapshots.length,
  });
  void recordRecordingProcessingTrace(
    withRawProcessingTrace({
      batchId,
      durationMs: Date.now() - startedAtMs,
      ignoredBeforeSessionStartRawEventCount,
      phaseDurationsMs,
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
