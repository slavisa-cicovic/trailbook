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
} from "../../storage/raw-location-events-storage";
import {
  loadTripPointsForTrip,
  refreshTripSegmentStatsForTripLocalId,
  refreshTripStatsForTripLocalId,
} from "../../storage/trip-points-storage";
import { toSnapshot, type CurrentLocationSnapshot } from "../location/location.service";
import type { LocationCallbackSource } from "../trip-points/trip-point-diagnostics.service";
import {
  processRecordedLocationSnapshots,
  type PersistRecordedLocationOptions,
} from "./recording-pipeline.service";

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

function groupTripPointsByRecordedAt(tripPoints: TripPoint[]): Map<string, TripPoint[]> {
  const groupedTripPoints = new Map<string, TripPoint[]>();

  for (const tripPoint of tripPoints) {
    const existingTripPoints = groupedTripPoints.get(tripPoint.recordedAt);

    if (existingTripPoints) {
      existingTripPoints.push(tripPoint);
    } else {
      groupedTripPoints.set(tripPoint.recordedAt, [tripPoint]);
    }
  }

  for (const groupedPoints of groupedTripPoints.values()) {
    groupedPoints.sort((left, right) => left.localId.localeCompare(right.localId));
  }

  return groupedTripPoints;
}

function buildRawLocationEvents(input: {
  activeSegmentLocalId: string | null;
  batchId: string;
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
      batchIndex: index,
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

function buildRawLocationEventProcessingResults(
  rawEvents: RawLocationEvent[],
  beforeTripPoints: TripPoint[],
  afterTripPoints: TripPoint[],
): RawLocationEventProcessingResult[] {
  const beforeTripPointIds = new Set(beforeTripPoints.map((tripPoint) => tripPoint.localId));
  const addedTripPointsByRecordedAt = groupTripPointsByRecordedAt(
    afterTripPoints.filter((tripPoint) => !beforeTripPointIds.has(tripPoint.localId)),
  );
  const afterTripPointsByRecordedAt = groupTripPointsByRecordedAt(afterTripPoints);
  const processedAt = new Date().toISOString();
  const seenRecordedAt = new Set<string>();

  return rawEvents.map((event) => {
    const addedTripPoints = addedTripPointsByRecordedAt.get(event.recordedAt) ?? [];
    const acceptedTripPoint = addedTripPoints.shift() ?? null;

    if (acceptedTripPoint) {
      return {
        acceptedTripPointLocalId: acceptedTripPoint.localId,
        localId: event.localId,
        processedAt,
        processingDecision: "accepted-by-recording-pipeline",
        processingStatus: "accepted",
        segmentLocalId: acceptedTripPoint.segmentLocalId,
      };
    }

    const hasAcceptedPointForRecordedAt = afterTripPointsByRecordedAt.has(event.recordedAt);
    const isDuplicateRawTimestamp = seenRecordedAt.has(event.recordedAt);

    seenRecordedAt.add(event.recordedAt);

    if (hasAcceptedPointForRecordedAt || isDuplicateRawTimestamp) {
      return {
        acceptedTripPointLocalId: null,
        localId: event.localId,
        processedAt,
        processingDecision: "duplicate-recorded-at",
        processingStatus: "duplicate",
        segmentLocalId: null,
      };
    }

    return {
      acceptedTripPointLocalId: null,
      localId: event.localId,
      processedAt,
      processingDecision: "filtered-by-recording-pipeline",
      processingStatus: "rejected",
      segmentLocalId: null,
    };
  });
}

async function refreshAcceptedTripStats(
  tripLocalId: string,
  processingResults: RawLocationEventProcessingResult[],
) {
  const acceptedCount = processingResults.filter((result) => result.processingStatus === "accepted").length;

  if (acceptedCount === 0) {
    return;
  }

  await refreshTripSegmentStatsForTripLocalId(tripLocalId);
  await refreshTripStatsForTripLocalId(tripLocalId);
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
  let rawEvents: RawLocationEvent[] = [];
  let beforeTripPoints: TripPoint[] = [];

  if (activeTripId) {
    const batchId = Crypto.randomUUID();
    const receivedAt = new Date().toISOString();

    rawEvents = buildRawLocationEvents({
      activeSegmentLocalId: recordingSession?.activeSegmentId ?? null,
      batchId,
      callbackSource,
      origin,
      receivedAt,
      sessionStartedAt: recordingSession?.startedAt ?? null,
      snapshots,
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

  await processRecordedLocationSnapshots(snapshots, callbackSource, options);

  if (!activeTripId || rawEvents.length === 0) {
    return;
  }

  const afterTripPoints = await loadTripPointsForTrip(activeTripId).catch(() => beforeTripPoints);
  const processingResults = buildRawLocationEventProcessingResults(
    rawEvents,
    beforeTripPoints,
    afterTripPoints,
  );

  await updateRawLocationEventProcessingResults(processingResults).catch((error) => {
    console.warn("[Trailbook][recording-engine]", {
      error: error instanceof Error ? error.message : String(error),
      step: "raw-status-update-failed",
      tripLocalId: activeTripId,
    });
  });
  await refreshAcceptedTripStats(activeTripId, processingResults).catch((error) => {
    console.warn("[Trailbook][recording-engine]", {
      error: error instanceof Error ? error.message : String(error),
      step: "stats-refresh-failed",
      tripLocalId: activeTripId,
    });
  });
}

export function persistBackgroundRecordedLocations(
  locations: Location.LocationObject[],
  options: PersistRecordedLocationOptions = {},
): Promise<void> {
  return recordLocationSnapshots(locations.map(toSnapshot), "background", options);
}
