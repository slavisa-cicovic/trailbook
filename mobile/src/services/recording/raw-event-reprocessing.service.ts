import type { RawLocationEvent, RawLocationEventProcessingResult } from "../../domain/raw-location-event";
import type { RecordingProfile, Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import { loadRecordingSession } from "../../storage/recording-storage";
import {
  loadRawLocationEventsForTrip,
  updateRawLocationEventProcessingResults,
} from "../../storage/raw-location-events-storage";
import { loadTripPointsForTrip, replaceTripPointsForTrip } from "../../storage/trip-points-storage";
import { loadTripSegments, saveTripSegments } from "../../storage/trip-segments-storage";
import { loadTrips, saveTrips } from "../../storage/trips-storage";
import { loadWaypoints, saveWaypoints } from "../../storage/waypoints-storage";
import { buildAutoBatchProfileSections } from "./auto-recording.service";
import {
  appendTripPointIfUseful,
  calculateTripDistanceMeters,
  createTripPointForLocation,
  resetPendingTripPointContinuity,
} from "../trip-points/trip-points.service";
import type { CurrentLocationSnapshot } from "../location/location.service";

export interface ReprocessedSegmentSummary {
  distanceMeters: number;
  durationMs: number;
  endedAt: string | null;
  pointCount: number;
  profile: RecordingProfile;
  segmentLocalId: string;
  startedAt: string;
}

export interface ReprocessingPreview {
  duplicateRawEventCount: number;
  firstAcceptedRecordedAt: string | null;
  firstRawRecordedAt: string | null;
  lastAcceptedRecordedAt: string | null;
  lastRawRecordedAt: string | null;
  maxAcceptedGapMs: number;
  maxRawGapMs: number;
  newDistanceMeters: number;
  newPointCount: number;
  newSegmentCount: number;
  newSegments: ReprocessedSegmentSummary[];
  oldDistanceMeters: number;
  oldPointCount: number;
  oldSegmentCount: number;
  oldSegments: ReprocessedSegmentSummary[];
  rawEventCount: number;
  rejectedRawEventCount: number;
  tripLocalId: string;
  warnings: string[];
}

interface ReplayResult {
  duplicateRawEventCount: number;
  firstRawRecordedAt: string | null;
  lastRawRecordedAt: string | null;
  maxRawGapMs: number;
  processingResults: RawLocationEventProcessingResult[];
  rejectedRawEventCount: number;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
}

interface ReprocessingBuildResult {
  nextWaypoints: Waypoint[];
  preview: ReprocessingPreview;
  trip: Trip;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
}

function getNextSyncStatus<T extends { syncStatus: "local-only" | "pending-sync" | "synced" | "sync-error" }>(
  entity: T,
): T["syncStatus"] {
  return entity.syncStatus === "local-only" ? "local-only" : "pending-sync";
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

function getSegmentLocalId(tripLocalId: string, index: number) {
  return `reprocessed-segment-${tripLocalId}-${index + 1}`;
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

function getTripDistanceMeters(tripPoints: TripPoint[], tripSegments: TripSegment[], tripLocalId: string): number {
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

function buildSegmentSummaries(
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  tripLocalId: string,
): ReprocessedSegmentSummary[] {
  return tripSegments
    .filter((segment) => segment.tripLocalId === tripLocalId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
    .map((segment) => {
      const segmentPoints = tripPoints
        .filter((tripPoint) => tripPoint.segmentLocalId === segment.localId)
        .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
      const distanceMeters = calculateTripDistanceMeters(segmentPoints);
      const durationMs = getElapsedMs(segment.startedAt, segment.endedAt);

      return {
        distanceMeters,
        durationMs,
        endedAt: segment.endedAt,
        pointCount: segmentPoints.length,
        profile: segment.recordingProfile,
        segmentLocalId: segment.localId,
        startedAt: segment.startedAt,
      };
    });
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

function buildRawProcessingResults(
  rawEvents: RawLocationEvent[],
  tripPoints: TripPoint[],
): RawLocationEventProcessingResult[] {
  const acceptedPointsByRecordedAt = new Map<string, TripPoint[]>();
  const processedAt = new Date().toISOString();
  const seenRawRecordedAt = new Set<string>();

  for (const tripPoint of tripPoints) {
    const existingPoints = acceptedPointsByRecordedAt.get(tripPoint.recordedAt);

    if (existingPoints) {
      existingPoints.push(tripPoint);
    } else {
      acceptedPointsByRecordedAt.set(tripPoint.recordedAt, [tripPoint]);
    }
  }

  return rawEvents.map((event) => {
    const acceptedPoints = acceptedPointsByRecordedAt.get(event.recordedAt) ?? [];
    const acceptedPoint = acceptedPoints.shift() ?? null;

    if (acceptedPoint) {
      seenRawRecordedAt.add(event.recordedAt);
      return {
        acceptedTripPointLocalId: acceptedPoint.localId,
        localId: event.localId,
        processedAt,
        processingDecision: "accepted-by-raw-reprocessing",
        processingStatus: "accepted",
        segmentLocalId: acceptedPoint.segmentLocalId,
      };
    }

    const duplicate = seenRawRecordedAt.has(event.recordedAt);
    seenRawRecordedAt.add(event.recordedAt);

    return {
      acceptedTripPointLocalId: null,
      localId: event.localId,
      processedAt,
      processingDecision: duplicate ? "duplicate-recorded-at" : "filtered-by-raw-reprocessing",
      processingStatus: duplicate ? "duplicate" : "rejected",
      segmentLocalId: null,
    };
  });
}

function remapWaypointSegment(waypoint: Waypoint, tripSegments: TripSegment[]): string | null {
  const waypointCreatedAtMs = new Date(waypoint.createdAt).getTime();

  if (Number.isNaN(waypointCreatedAtMs) || tripSegments.length === 0) {
    return null;
  }

  const matchingSegment = tripSegments.find((segment) => {
    const startedAtMs = new Date(segment.startedAt).getTime();
    const endedAtMs = segment.endedAt ? new Date(segment.endedAt).getTime() : Number.POSITIVE_INFINITY;

    return (
      Number.isFinite(startedAtMs) &&
      Number.isFinite(endedAtMs) &&
      waypointCreatedAtMs >= startedAtMs &&
      waypointCreatedAtMs <= endedAtMs
    );
  });

  if (matchingSegment) {
    return matchingSegment.localId;
  }

  const nearestSegment = [...tripSegments].sort((left, right) => {
    const leftStart = new Date(left.startedAt).getTime();
    const rightStart = new Date(right.startedAt).getTime();

    return Math.abs(waypointCreatedAtMs - leftStart) - Math.abs(waypointCreatedAtMs - rightStart);
  })[0];

  return nearestSegment?.localId ?? null;
}

function remapWaypoints(
  waypoints: Waypoint[],
  tripLocalId: string,
  tripSegments: TripSegment[],
): Waypoint[] {
  const updatedAt = new Date().toISOString();

  return waypoints.map((waypoint) => {
    if (waypoint.tripLocalId !== tripLocalId) {
      return waypoint;
    }

    const nextSegmentLocalId = remapWaypointSegment(waypoint, tripSegments);

    if (nextSegmentLocalId === waypoint.segmentLocalId) {
      return waypoint;
    }

    return {
      ...waypoint,
      segmentLocalId: nextSegmentLocalId,
      syncStatus: getNextSyncStatus(waypoint),
      updatedAt,
    };
  });
}

function replayRawEvents(trip: Trip, rawEvents: RawLocationEvent[]): ReplayResult {
  const sortedRawEvents = [...rawEvents].sort((left, right) => {
    const recordedAtCompare = left.recordedAt.localeCompare(right.recordedAt);

    if (recordedAtCompare !== 0) {
      return recordedAtCompare;
    }

    return left.batchIndex - right.batchIndex;
  });
  const snapshots = sortedRawEvents.map(toSnapshot);
  const firstRawRecordedAt = sortedRawEvents[0]?.recordedAt ?? null;
  const lastRawRecordedAt = sortedRawEvents[sortedRawEvents.length - 1]?.recordedAt ?? null;
  const sections = buildAutoBatchProfileSections(snapshots, trip.recordingProfile);
  let nextTripPoints: TripPoint[] = [];
  let lastSequentialTripPoint: TripPoint | null = null;
  const nextTripSegments: TripSegment[] = [];

  resetPendingTripPointContinuity(trip.localId);

  try {
    sections.forEach((section, index) => {
      const segment: TripSegment = {
        createdAt: section.startedAt,
        deviceId: trip.deviceId,
        distanceMeters: 0,
        durationMs: 0,
        endedAt: index === sections.length - 1 ? trip.endedAt ?? section.endedAt : section.endedAt,
        localId: getSegmentLocalId(trip.localId, index),
        pointCount: 0,
        recordingProfile: section.profile,
        serverId: null,
        startedAt: index === 0 ? firstRawRecordedAt ?? section.startedAt : section.startedAt,
        statsUpdatedAt: section.startedAt,
        syncStatus: "pending-sync",
        tripLocalId: trip.localId,
        updatedAt: section.endedAt,
        userId: trip.userId,
      };

      nextTripSegments.push(segment);

      for (const snapshot of section.samples) {
        const candidateTripPoint = createTripPointForLocation(trip, segment.localId, snapshot);
        const appendedTripPoints = appendTripPointIfUseful(
          nextTripPoints,
          {
            ...candidateTripPoint,
            syncStatus: "pending-sync",
          },
          section.profile,
          "background",
          {
            lastSequentialTripPoint,
            sessionStartedAt: trip.startedAt,
            tripStartedAt: trip.startedAt,
          },
        );

        lastSequentialTripPoint = candidateTripPoint;
        nextTripPoints = appendedTripPoints;
      }
    });
  } finally {
    resetPendingTripPointContinuity(trip.localId);
  }

  const segmentsWithStats = nextTripSegments.map((segment) => withSegmentStats(segment, nextTripPoints));
  const processingResults = buildRawProcessingResults(sortedRawEvents, nextTripPoints);

  return {
    duplicateRawEventCount: processingResults.filter((result) => result.processingStatus === "duplicate").length,
    firstRawRecordedAt,
    lastRawRecordedAt,
    maxRawGapMs: getMaxGapMs(sortedRawEvents.map((event) => event.recordedAt)),
    processingResults,
    rejectedRawEventCount: processingResults.filter((result) => result.processingStatus === "rejected").length,
    tripPoints: nextTripPoints,
    tripSegments: segmentsWithStats,
  };
}

function buildWarnings(input: {
  newDistanceMeters: number;
  newPointCount: number;
  oldDistanceMeters: number;
  oldPointCount: number;
  rawEvents: RawLocationEvent[];
  trip: Trip;
}) {
  const warnings: string[] = [];
  const distanceRatio =
    input.oldDistanceMeters > 0
      ? Math.abs(input.newDistanceMeters - input.oldDistanceMeters) / input.oldDistanceMeters
      : 0;
  const pointCountRatio =
    input.oldPointCount > 0 ? Math.abs(input.newPointCount - input.oldPointCount) / input.oldPointCount : 0;
  const firstRaw = input.rawEvents[0] ?? null;
  const lastRaw = input.rawEvents[input.rawEvents.length - 1] ?? null;

  if (distanceRatio > 0.3) {
    warnings.push("New distance differs from old distance by more than 30%.");
  }

  if (pointCountRatio > 0.5) {
    warnings.push("New point count differs from old point count by more than 50%.");
  }

  if (firstRaw && firstRaw.recordedAt > input.trip.startedAt) {
    warnings.push("Raw events start after trip start.");
  }

  if (lastRaw && input.trip.endedAt && lastRaw.recordedAt < input.trip.endedAt) {
    warnings.push("Raw events end before trip end.");
  }

  return warnings;
}

async function buildReprocessingResult(tripLocalId: string): Promise<ReprocessingBuildResult> {
  const [trips, allTripSegments, allWaypoints, oldTripPoints, rawEvents, recordingSession] = await Promise.all([
    loadTrips(),
    loadTripSegments(),
    loadWaypoints(),
    loadTripPointsForTrip(tripLocalId),
    loadRawLocationEventsForTrip(tripLocalId),
    loadRecordingSession(),
  ]);
  const trip = trips.find((candidate) => candidate.localId === tripLocalId && candidate.deletedAt === null) ?? null;

  if (!trip) {
    throw new Error("Trip was not found.");
  }

  if (
    trip.status !== "ended" ||
    trip.endedAt === null ||
    (recordingSession?.status === "recording" && recordingSession.activeTripId === tripLocalId)
  ) {
    throw new Error("Only ended inactive trips can be reprocessed.");
  }

  if (rawEvents.length === 0) {
    throw new Error("This trip has no local raw location events.");
  }

  const sortedRawEvents = [...rawEvents].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const oldTripSegments = allTripSegments.filter((segment) => segment.tripLocalId === tripLocalId);
  const replay = replayRawEvents(trip, sortedRawEvents);
  const oldDistanceMeters = trip.distanceMeters ?? getTripDistanceMeters(oldTripPoints, oldTripSegments, tripLocalId);
  const newDistanceMeters = getTripDistanceMeters(replay.tripPoints, replay.tripSegments, tripLocalId);
  const firstAcceptedRecordedAt = replay.tripPoints[0]?.recordedAt ?? null;
  const lastAcceptedRecordedAt = replay.tripPoints[replay.tripPoints.length - 1]?.recordedAt ?? null;
  const warnings = buildWarnings({
    newDistanceMeters,
    newPointCount: replay.tripPoints.length,
    oldDistanceMeters,
    oldPointCount: oldTripPoints.length,
    rawEvents: sortedRawEvents,
    trip,
  });

  if (replay.tripPoints.length === 0 && oldTripPoints.length > 0) {
    warnings.push("Reprocessing produced zero accepted points.");
  }

  const nextWaypoints = remapWaypoints(allWaypoints, tripLocalId, replay.tripSegments);

  return {
    nextWaypoints,
    preview: {
      duplicateRawEventCount: replay.duplicateRawEventCount,
      firstAcceptedRecordedAt,
      firstRawRecordedAt: replay.firstRawRecordedAt,
      lastAcceptedRecordedAt,
      lastRawRecordedAt: replay.lastRawRecordedAt,
      maxAcceptedGapMs: getMaxGapMs(replay.tripPoints.map((tripPoint) => tripPoint.recordedAt)),
      maxRawGapMs: replay.maxRawGapMs,
      newDistanceMeters,
      newPointCount: replay.tripPoints.length,
      newSegmentCount: replay.tripSegments.length,
      newSegments: buildSegmentSummaries(replay.tripSegments, replay.tripPoints, tripLocalId),
      oldDistanceMeters,
      oldPointCount: oldTripPoints.length,
      oldSegmentCount: oldTripSegments.length,
      oldSegments: buildSegmentSummaries(oldTripSegments, oldTripPoints, tripLocalId),
      rawEventCount: sortedRawEvents.length,
      rejectedRawEventCount: replay.rejectedRawEventCount,
      tripLocalId,
      warnings,
    },
    trip,
    tripPoints: replay.tripPoints,
    tripSegments: replay.tripSegments,
  };
}

export async function previewRawEventReprocessing(tripLocalId: string): Promise<ReprocessingPreview> {
  return (await buildReprocessingResult(tripLocalId)).preview;
}

export async function applyRawEventReprocessing(tripLocalId: string): Promise<ReprocessingPreview> {
  const result = await buildReprocessingResult(tripLocalId);

  if (result.tripPoints.length === 0) {
    throw new Error("Reprocessing produced zero accepted points.");
  }

  const [trips, allTripSegments, allWaypoints, rawEvents] = await Promise.all([
    loadTrips(),
    loadTripSegments(),
    loadWaypoints(),
    loadRawLocationEventsForTrip(tripLocalId),
  ]);
  const updatedAt = new Date().toISOString();
  const nextTrip = {
    ...result.trip,
    distanceMeters: result.preview.newDistanceMeters,
    pointCount: result.preview.newPointCount,
    statsUpdatedAt: updatedAt,
    syncStatus: getNextSyncStatus(result.trip),
    updatedAt,
  };

  await saveTrips(trips.map((trip) => (trip.localId === tripLocalId ? nextTrip : trip)));
  await saveTripSegments(
    [
      ...allTripSegments.filter((segment) => segment.tripLocalId !== tripLocalId),
      ...result.tripSegments,
    ],
    allTripSegments,
  );
  await replaceTripPointsForTrip(tripLocalId, result.tripPoints);
  await saveWaypoints(result.nextWaypoints, allWaypoints);
  await updateRawLocationEventProcessingResults(
    buildRawProcessingResults(
      rawEvents.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt)),
      result.tripPoints,
    ),
  );

  return result.preview;
}
