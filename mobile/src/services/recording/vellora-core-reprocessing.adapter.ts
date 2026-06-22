import type { RawLocationEvent, RawLocationEventProcessingResult } from "../../domain/raw-location-event";
import type { RecordingProfile, Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import type {
  RawLocationSample,
  SegmentCore,
  SegmentType,
  TripBundleCore,
  WaypointCore,
} from "../../core/trips";
import { PROCESSING_VERSION, processTripBundle } from "../../core/trips";
import type { RawReprocessingInputModel } from "../../repositories/reprocessing-repository";
import { calculateTripDistanceMeters } from "../trips/trip-distance.service";
import { buildRawLocationEventProcessingResults, sortRawLocationEvents } from "./raw-location-event-processing.service";
import {
  countDuplicateRecordedAtValues,
  countRawProcessingResults,
  type RecordingProcessingTrace,
} from "./recording-processing-trace.service";

export interface VelloraCoreReprocessingOutput {
  bundle: TripBundleCore;
  coreSegments: SegmentCore[];
  processingResults: RawLocationEventProcessingResult[];
  processingTrace: RecordingProcessingTrace;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
}

function toCoreTripStatus(status: Trip["status"]): TripBundleCore["trip"]["status"] {
  if (status === "active") {
    return "recording";
  }

  if (status === "paused") {
    return "paused";
  }

  return "completed";
}

function toCoreSyncState(syncStatus: Trip["syncStatus"]): TripBundleCore["trip"]["syncState"] {
  if (syncStatus === "synced") {
    return "synced";
  }

  if (syncStatus === "sync-error") {
    return "failed";
  }

  return "pending";
}

function toCoreLocationSample(event: RawLocationEvent): RawLocationSample {
  return {
    accuracyM: event.accuracy,
    altitudeM: event.altitude,
    bearingDeg: null,
    latitude: event.latitude,
    longitude: event.longitude,
    provider: event.callbackSource,
    speedMps: event.speed,
    timestamp: event.recordedAt,
    tripId: event.tripLocalId,
  };
}

function toCoreWaypoint(waypoint: Waypoint): WaypointCore {
  return {
    createdAt: waypoint.createdAt,
    id: waypoint.localId,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    note: waypoint.note,
    segmentIndex: null,
    title: waypoint.title,
    tripId: waypoint.tripLocalId,
    type: waypoint.category,
    updatedAt: waypoint.updatedAt,
  };
}

function buildCaptureMeta(trip: Trip): TripBundleCore["captureMeta"] {
  return {
    appVersion: "unknown",
    captureSchemaVersion: 1,
    captureTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deviceModel: trip.deviceId,
    osApiLevel: "unknown",
    tripId: trip.localId,
  };
}

export function buildVelloraTripBundleFromLegacyInput(inputModel: RawReprocessingInputModel): TripBundleCore {
  const sortedRawEvents = sortRawLocationEvents(inputModel.rawEvents);

  return {
    activities: [],
    captureMeta: buildCaptureMeta(inputModel.trip),
    deviceStates: [],
    locations: sortedRawEvents.map(toCoreLocationSample),
    segments: [],
    sessionEvents: [
      {
        timestamp: inputModel.trip.startedAt,
        tripId: inputModel.trip.localId,
        type: "recording_started",
      },
      ...(inputModel.trip.endedAt
        ? [
            {
              timestamp: inputModel.trip.endedAt,
              tripId: inputModel.trip.localId,
              type: "recording_stopped" as const,
            },
          ]
        : []),
    ],
    trip: {
      clientTripId: inputModel.trip.localId,
      description: inputModel.trip.description,
      endedAt: inputModel.trip.endedAt,
      processingVersion: PROCESSING_VERSION,
      startedAt: inputModel.trip.startedAt,
      status: toCoreTripStatus(inputModel.trip.status),
      syncState: toCoreSyncState(inputModel.trip.syncStatus),
      title: inputModel.trip.title,
    },
    waypoints: inputModel.waypoints
      .filter((waypoint) => waypoint.tripLocalId === inputModel.trip.localId && waypoint.deletedAt === null)
      .map(toCoreWaypoint),
  };
}

function toLegacyRecordingProfile(segmentType: SegmentType): RecordingProfile {
  if (segmentType === "unknown") {
    return "stationary";
  }

  return segmentType;
}

function getSegmentLocalId(tripLocalId: string, segment: SegmentCore): string {
  return `core-segment-${tripLocalId}-${segment.index + 1}`;
}

function getElapsedMs(startedAt: string, endedAt: string | null): number {
  if (!endedAt) {
    return 0;
  }

  const startedAtMs = new Date(startedAt).getTime();
  const endedAtMs = new Date(endedAt).getTime();

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) || endedAtMs < startedAtMs) {
    return 0;
  }

  return endedAtMs - startedAtMs;
}

function buildLegacySegments(input: {
  coreSegments: SegmentCore[];
  now: string;
  outputSyncStatus: TripPoint["syncStatus"];
  trip: Trip;
}): TripSegment[] {
  return input.coreSegments.map((segment) => ({
    createdAt: segment.startedAt,
    deviceId: input.trip.deviceId,
    distanceMeters: segment.distanceM ?? 0,
    durationMs: getElapsedMs(segment.startedAt, segment.endedAt),
    endedAt: segment.endedAt,
    localId: getSegmentLocalId(input.trip.localId, segment),
    pointCount: 0,
    recordingProfile: toLegacyRecordingProfile(segment.segmentType),
    serverId: null,
    startedAt: segment.startedAt,
    statsUpdatedAt: input.now,
    syncStatus: input.outputSyncStatus,
    tripLocalId: input.trip.localId,
    updatedAt: input.now,
    userId: input.trip.userId,
  }));
}

function findSegmentForEvent(event: RawLocationEvent, segments: SegmentCore[]): SegmentCore | null {
  const eventMs = new Date(event.recordedAt).getTime();

  if (!Number.isFinite(eventMs)) {
    return null;
  }

  return (
    segments.find((segment) => {
      const startedAtMs = new Date(segment.startedAt).getTime();
      const endedAtMs = new Date(segment.endedAt).getTime();

      return Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && eventMs >= startedAtMs && eventMs <= endedAtMs;
    }) ?? null
  );
}

function buildLegacyTripPoints(input: {
  coreSegments: SegmentCore[];
  outputSyncStatus: TripPoint["syncStatus"];
  rawEvents: RawLocationEvent[];
  trip: Trip;
}): TripPoint[] {
  const points: TripPoint[] = [];

  for (const event of input.rawEvents) {
    const segment = findSegmentForEvent(event, input.coreSegments);

    if (!segment) {
      continue;
    }

    points.push({
      accuracy: event.accuracy,
      altitude: event.altitude,
      deviceId: input.trip.deviceId,
      latitude: event.latitude,
      localId: `core-point-${event.localId}`,
      longitude: event.longitude,
      recordedAt: event.recordedAt,
      segmentLocalId: getSegmentLocalId(input.trip.localId, segment),
      serverId: null,
      speed: event.speed,
      syncStatus: input.outputSyncStatus,
      tripLocalId: input.trip.localId,
      userId: input.trip.userId,
    });
  }

  return points.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.localId.localeCompare(right.localId));
}

function withLegacySegmentStats(segments: TripSegment[], points: TripPoint[], now: string): TripSegment[] {
  return segments.map((segment) => {
    const segmentPoints = points.filter((point) => point.segmentLocalId === segment.localId);

    return {
      ...segment,
      distanceMeters: calculateTripDistanceMeters(segmentPoints),
      durationMs: getElapsedMs(segment.startedAt, segment.endedAt),
      pointCount: segmentPoints.length,
      statsUpdatedAt: now,
    };
  });
}

function getMaxGapMs(recordedAtValues: string[]): number {
  const orderedTimes = recordedAtValues
    .map((recordedAt) => new Date(recordedAt).getTime())
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  let maxGapMs = 0;

  for (let index = 1; index < orderedTimes.length; index += 1) {
    maxGapMs = Math.max(maxGapMs, orderedTimes[index] - orderedTimes[index - 1]);
  }

  return maxGapMs;
}

function buildProcessingTrace(input: {
  outputTripPoints: TripPoint[];
  processingResults: RawLocationEventProcessingResult[];
  rawEvents: RawLocationEvent[];
  segments: TripSegment[];
  trip: Trip;
}): RecordingProcessingTrace {
  const firstSegment = input.segments[0] ?? null;
  const lastSegment = input.segments[input.segments.length - 1] ?? null;
  const firstRawRecordedAt = input.rawEvents[0]?.recordedAt ?? null;
  const lastRawRecordedAt = input.rawEvents[input.rawEvents.length - 1]?.recordedAt ?? null;

  return {
    acceptedPointCount: input.outputTripPoints.length,
    activeProfile: lastSegment?.recordingProfile ?? input.trip.recordingProfile,
    batchId: null,
    callbackSource: "reprocess",
    duplicateRawEventCount: countRawProcessingResults(input.processingResults, "duplicate"),
    duplicateRecordedAtCount: countDuplicateRecordedAtValues(input.rawEvents.map((event) => event.recordedAt)),
    firstRecordedAt: firstRawRecordedAt,
    inferredProfile: firstSegment?.recordingProfile ?? null,
    inputSnapshotCount: input.rawEvents.length,
    lastRecordedAt: lastRawRecordedAt,
    maxAcceptedGapMs: getMaxGapMs(input.outputTripPoints.map((point) => point.recordedAt)),
    maxRawGapMs: getMaxGapMs(input.rawEvents.map((event) => event.recordedAt)),
    origin: input.rawEvents.length === 0 ? "reprocess" : input.rawEvents[0]?.origin ?? "reprocess",
    previousProfile: input.trip.recordingProfile,
    processedAt: input.processingResults[0]?.processedAt ?? new Date().toISOString(),
    processingMode: "reprocess",
    rawInsertedCount: input.rawEvents.length,
    recoveredPointCount: 0,
    rejectedPointCount: countRawProcessingResults(input.processingResults, "rejected"),
    rejectedRawEventCount: countRawProcessingResults(input.processingResults, "rejected"),
    sortedSnapshotCount: input.rawEvents.length,
    transitionAt: firstSegment?.startedAt ?? null,
    transitionChanged: input.segments.some((segment) => segment.recordingProfile !== input.trip.recordingProfile),
    tripLocalId: input.trip.localId,
  };
}

export function processLegacyInputWithVelloraCore(inputModel: RawReprocessingInputModel): VelloraCoreReprocessingOutput {
  const bundle = buildVelloraTripBundleFromLegacyInput(inputModel);
  const sortedRawEvents = sortRawLocationEvents(inputModel.rawEvents);
  const now = new Date().toISOString();
  const outputSyncStatus: TripPoint["syncStatus"] =
    inputModel.trip.syncStatus === "local-only" ? "local-only" : "pending-sync";
  const coreSegments = processTripBundle(bundle);
  let tripSegments = buildLegacySegments({
    coreSegments,
    now,
    outputSyncStatus,
    trip: inputModel.trip,
  });
  const tripPoints = buildLegacyTripPoints({
    coreSegments,
    outputSyncStatus,
    rawEvents: sortedRawEvents,
    trip: inputModel.trip,
  });

  tripSegments = withLegacySegmentStats(tripSegments, tripPoints, now);

  const processingResults = buildRawLocationEventProcessingResults({
    acceptedDecision: "accepted-by-vellora-core",
    afterTripPoints: tripPoints,
    beforeTripPoints: [],
    processedAt: now,
    rawEvents: sortedRawEvents,
    rejectedDecision: "filtered-by-vellora-core",
  });

  return {
    bundle: {
      ...bundle,
      segments: coreSegments,
    },
    coreSegments,
    processingResults,
    processingTrace: buildProcessingTrace({
      outputTripPoints: tripPoints,
      processingResults,
      rawEvents: sortedRawEvents,
      segments: tripSegments,
      trip: inputModel.trip,
    }),
    tripPoints,
    tripSegments,
  };
}
