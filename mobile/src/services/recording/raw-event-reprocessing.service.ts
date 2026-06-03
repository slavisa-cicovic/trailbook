import type { RawLocationEvent } from "../../domain/raw-location-event";
import type { Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import { loadRecordingSession } from "../../storage/recording-storage";
import { loadRawLocationEventsForTrip } from "../../repositories/raw-location-events-repository";
import { loadTripPointsForTrip } from "../../repositories/trip-points-repository";
import { loadTripSegments } from "../../repositories/trip-segments-repository";
import { loadTrips } from "../../repositories/trips-repository";
import { loadWaypoints } from "../../repositories/waypoints-repository";
import {
  buildSegmentSummaries,
  getTripDistanceMeters,
  processRawLocationEventsForTrip,
  sortRawLocationEvents,
  type RecordingProcessorSegmentSummary,
} from "./recording-processor.service";
import { applyRawEventReprocessingUnitOfWork } from "./recording-unit-of-work.service";

export type ReprocessedSegmentSummary = RecordingProcessorSegmentSummary;

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

interface ReprocessingBuildResult {
  nextWaypoints: Waypoint[];
  preview: ReprocessingPreview;
  processingResults: ReturnType<typeof processRawLocationEventsForTrip>["processingResults"];
  trip: Trip;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
}

function getNextSyncStatus<T extends { syncStatus: "local-only" | "pending-sync" | "synced" | "sync-error" }>(
  entity: T,
): T["syncStatus"] {
  return entity.syncStatus === "local-only" ? "local-only" : "pending-sync";
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

  const sortedRawEvents = sortRawLocationEvents(rawEvents);
  const oldTripSegments = allTripSegments.filter((segment) => segment.tripLocalId === tripLocalId);
  const replay = processRawLocationEventsForTrip({
    rawEvents: sortedRawEvents,
    trip,
  });
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
      maxAcceptedGapMs: replay.maxAcceptedGapMs,
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
    processingResults: replay.processingResults,
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

  await applyRawEventReprocessingUnitOfWork({
    distanceMeters: result.preview.newDistanceMeters,
    pointCount: result.preview.newPointCount,
    processingResults: result.processingResults,
    trip: result.trip,
    tripLocalId,
    tripPoints: result.tripPoints,
    tripSegments: result.tripSegments,
    waypoints: result.nextWaypoints,
  });

  return result.preview;
}
