import type { RawLocationEvent, RawLocationEventProcessingResult } from "../../domain/raw-location-event";
import type { RecordingProfile, Trip, TripPoint, TripSegment } from "../../domain/trips";
import type { CurrentLocationSnapshot } from "../location/location.service";
import type { LocationCallbackSource } from "../trip-points/trip-point-diagnostics.service";
import {
  appendTripPointIfUseful,
  calculateTripDistanceMeters,
  createTripPointForLocation,
  resetPendingTripPointContinuity,
} from "../trip-points/trip-points.service";
import { buildAutoBatchProfileSections } from "./auto-recording.service";
import {
  buildRawLocationEventProcessingResults,
  sortRawLocationEvents,
} from "./raw-location-event-processing.service";

export { buildRawLocationEventProcessingResults, sortRawLocationEvents };

export interface RecordingProcessorSegmentSummary {
  distanceMeters: number;
  durationMs: number;
  endedAt: string | null;
  pointCount: number;
  profile: RecordingProfile;
  segmentLocalId: string;
  startedAt: string;
}

export interface RecordingProcessorReplayInput {
  callbackSource?: LocationCallbackSource;
  fallbackProfile?: RecordingProfile;
  outputSyncStatus?: TripPoint["syncStatus"];
  rawEvents: RawLocationEvent[];
  segmentLocalIdPrefix?: string;
  trip: Trip;
}

export interface RecordingProcessorReplayOutput {
  duplicateRawEventCount: number;
  firstRawRecordedAt: string | null;
  lastRawRecordedAt: string | null;
  maxAcceptedGapMs: number;
  maxRawGapMs: number;
  processingResults: RawLocationEventProcessingResult[];
  rejectedRawEventCount: number;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
}

function toSnapshot(rawEvent: RawLocationEvent): CurrentLocationSnapshot {
  return {
    accuracy: rawEvent.accuracy,
    altitude: rawEvent.altitude,
    latitude: rawEvent.latitude,
    longitude: rawEvent.longitude,
    recordedAt: rawEvent.recordedAt,
    speed: rawEvent.speed,
  };
}

function getSegmentLocalId(tripLocalId: string, segmentLocalIdPrefix: string, index: number) {
  return `${segmentLocalIdPrefix}-${tripLocalId}-${index + 1}`;
}

function getElapsedMs(startedAt: string, endedAt: string | null): number {
  if (!endedAt) {
    return 0;
  }

  const startedAtMs = new Date(startedAt).getTime();
  const endedAtMs = new Date(endedAt).getTime();

  if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs) || endedAtMs < startedAtMs) {
    return 0;
  }

  return endedAtMs - startedAtMs;
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

function withSegmentStats(segment: TripSegment, tripPoints: TripPoint[]): TripSegment {
  const segmentPoints = tripPoints
    .filter((tripPoint) => tripPoint.segmentLocalId === segment.localId)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const statsUpdatedAt = new Date().toISOString();

  return {
    ...segment,
    distanceMeters: calculateTripDistanceMeters(segmentPoints),
    durationMs: getElapsedMs(segment.startedAt, segment.endedAt),
    pointCount: segmentPoints.length,
    statsUpdatedAt,
  };
}

export function getTripDistanceMeters(
  tripPoints: TripPoint[],
  tripSegments: TripSegment[],
  tripLocalId: string,
): number {
  const orderedSegments = tripSegments
    .filter((segment) => segment.tripLocalId === tripLocalId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));

  if (orderedSegments.length === 0) {
    return calculateTripDistanceMeters(
      tripPoints
        .filter((tripPoint) => tripPoint.tripLocalId === tripLocalId)
        .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt)),
    );
  }

  return orderedSegments.reduce((distanceMeters, segment) => {
    const segmentPoints = tripPoints
      .filter((tripPoint) => tripPoint.segmentLocalId === segment.localId)
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));

    return distanceMeters + calculateTripDistanceMeters(segmentPoints);
  }, 0);
}

export function buildSegmentSummaries(
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  tripLocalId: string,
): RecordingProcessorSegmentSummary[] {
  return tripSegments
    .filter((segment) => segment.tripLocalId === tripLocalId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    .map((segment) => {
      const segmentPoints = tripPoints
        .filter((tripPoint) => tripPoint.segmentLocalId === segment.localId)
        .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));

      return {
        distanceMeters: calculateTripDistanceMeters(segmentPoints),
        durationMs: getElapsedMs(segment.startedAt, segment.endedAt),
        endedAt: segment.endedAt,
        pointCount: segmentPoints.length,
        profile: segment.recordingProfile,
        segmentLocalId: segment.localId,
        startedAt: segment.startedAt,
      };
    });
}

export function processRawLocationEventsForTrip(
  input: RecordingProcessorReplayInput,
): RecordingProcessorReplayOutput {
  const sortedRawEvents = sortRawLocationEvents(input.rawEvents);
  const snapshots = sortedRawEvents.map(toSnapshot);
  const firstRawRecordedAt = sortedRawEvents[0]?.recordedAt ?? null;
  const lastRawRecordedAt = sortedRawEvents[sortedRawEvents.length - 1]?.recordedAt ?? null;
  const sections = buildAutoBatchProfileSections(snapshots, input.fallbackProfile ?? input.trip.recordingProfile);
  const segmentLocalIdPrefix = input.segmentLocalIdPrefix ?? "reprocessed-segment";
  const callbackSource = input.callbackSource ?? "background";
  const outputSyncStatus = input.outputSyncStatus ?? "pending-sync";
  let nextTripPoints: TripPoint[] = [];
  let lastSequentialTripPoint: TripPoint | null = null;
  const nextTripSegments: TripSegment[] = [];

  resetPendingTripPointContinuity(input.trip.localId);

  try {
    sections.forEach((section, index) => {
      const segment: TripSegment = {
        createdAt: section.startedAt,
        deviceId: input.trip.deviceId,
        distanceMeters: 0,
        durationMs: 0,
        endedAt: index === sections.length - 1 ? input.trip.endedAt ?? section.endedAt : section.endedAt,
        localId: getSegmentLocalId(input.trip.localId, segmentLocalIdPrefix, index),
        pointCount: 0,
        recordingProfile: section.profile,
        serverId: null,
        startedAt: index === 0 ? firstRawRecordedAt ?? section.startedAt : section.startedAt,
        statsUpdatedAt: section.startedAt,
        syncStatus: outputSyncStatus,
        tripLocalId: input.trip.localId,
        updatedAt: section.endedAt,
        userId: input.trip.userId,
      };

      nextTripSegments.push(segment);

      for (const snapshot of section.samples) {
        const candidateTripPoint = createTripPointForLocation(input.trip, segment.localId, snapshot);
        const appendedTripPoints = appendTripPointIfUseful(
          nextTripPoints,
          {
            ...candidateTripPoint,
            syncStatus: outputSyncStatus,
          },
          section.profile,
          callbackSource,
          {
            lastSequentialTripPoint,
            sessionStartedAt: input.trip.startedAt,
            tripStartedAt: input.trip.startedAt,
          },
        );

        lastSequentialTripPoint = candidateTripPoint;
        nextTripPoints = appendedTripPoints;
      }
    });
  } finally {
    resetPendingTripPointContinuity(input.trip.localId);
  }

  const tripSegments = nextTripSegments.map((segment) => withSegmentStats(segment, nextTripPoints));
  const processingResults = buildRawLocationEventProcessingResults({
    acceptedDecision: "accepted-by-recording-processor",
    afterTripPoints: nextTripPoints,
    beforeTripPoints: [],
    rawEvents: sortedRawEvents,
    rejectedDecision: "filtered-by-recording-processor",
  });

  return {
    duplicateRawEventCount: processingResults.filter((result) => result.processingStatus === "duplicate").length,
    firstRawRecordedAt,
    lastRawRecordedAt,
    maxAcceptedGapMs: getMaxGapMs(nextTripPoints.map((tripPoint) => tripPoint.recordedAt)),
    maxRawGapMs: getMaxGapMs(sortedRawEvents.map((event) => event.recordedAt)),
    processingResults,
    rejectedRawEventCount: processingResults.filter((result) => result.processingStatus === "rejected").length,
    tripPoints: nextTripPoints,
    tripSegments,
  };
}
