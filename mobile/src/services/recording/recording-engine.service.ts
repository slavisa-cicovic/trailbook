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
  refreshTripSegmentStatsForTripLocalId,
  refreshTripStatsForTripLocalId,
} from "../../repositories/trip-points-repository";
import { toSnapshot, type CurrentLocationSnapshot } from "../location/location.service";
import type { LocationCallbackSource } from "../trip-points/trip-point-diagnostics.service";
import {
  processRecordedLocationSnapshots,
  type PersistRecordedLocationOptions,
} from "./recording-pipeline.service";
import { buildRawLocationEventProcessingResults } from "./raw-location-event-processing.service";
import { recordRecordingNativeEvent } from "./recording-native-events.service";

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
    void recordRecordingNativeEvent({
      eventType: snapshots.length > 1 ? "native_location_batch" : "native_location_callback",
      payload: {
        activeSegmentLocalId: recordingSession?.activeSegmentId ?? null,
        batchId,
        callbackSource,
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

  await processRecordedLocationSnapshots(snapshots, callbackSource, options);

  if (!activeTripId || rawEvents.length === 0) {
    return;
  }

  const afterTripPoints = await loadTripPointsForTrip(activeTripId).catch(() => beforeTripPoints);
  const processingResults = buildRawLocationEventProcessingResults({
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
