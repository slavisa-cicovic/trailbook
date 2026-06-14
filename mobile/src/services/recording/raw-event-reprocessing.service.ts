import type { RawLocationEvent } from "../../domain/raw-location-event";
import type { Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import {
  loadRawReprocessingInputModel,
  type RawReprocessingInputModel,
} from "../../repositories/reprocessing-repository";
import {
  buildSegmentSummaries,
  getTripDistanceMeters,
  processRawLocationEventsForTrip,
  sortRawLocationEvents,
  type RecordingProcessorSegmentSummary,
} from "./recording-processor.service";
import type { RecordingProcessingTrace } from "./recording-processing-trace.service";
import { applyRawEventReprocessingUnitOfWork } from "./recording-unit-of-work.service";
import { saveRawEventReprocessingUndoSnapshotForTrip } from "./raw-event-reprocessing-undo.service";
import {
  normalizeGroundSegmentProfilesBySpeed,
  removeInitialAutoBootstrapWalkSegment,
} from "../trip-segments/trip-segments.service";

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
  processingTrace: RecordingProcessingTrace;
  rawEventCount: number;
  rejectedRawEventCount: number;
  tripLocalId: string;
  warnings: string[];
}

export interface RawReprocessingBuildResult {
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

export function buildRawReprocessingPreview(inputModel: RawReprocessingInputModel): RawReprocessingBuildResult {
  const { trip, tripSegments: oldTripSegments, waypoints, rawEvents, oldTripPoints } = inputModel;

  if (rawEvents.length === 0) {
    throw new Error("This trip has no local raw location events.");
  }

  const sortedRawEvents = sortRawLocationEvents(rawEvents);
  const replay = processRawLocationEventsForTrip({ rawEvents: sortedRawEvents, trip });
  let replayTripPoints = replay.tripPoints;
  let replayTripSegments = replay.tripSegments;
  let nextWaypoints = remapWaypoints(waypoints, trip.localId, replayTripSegments);
  const orderedReplaySegments = replayTripSegments
    .filter((segment) => segment.tripLocalId === trip.localId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const firstNonWalkSegment = orderedReplaySegments.find((segment, index) =>
    index > 0 && segment.recordingProfile !== "walk",
  );

  if (firstNonWalkSegment) {
    const prunedState = removeInitialAutoBootstrapWalkSegment(
      replayTripSegments,
      replayTripPoints,
      nextWaypoints,
      trip.localId,
      firstNonWalkSegment.localId,
      new Date().toISOString(),
    );

    replayTripPoints = prunedState.tripPoints;
    replayTripSegments = prunedState.tripSegments;
    nextWaypoints = prunedState.waypoints;
  }

  replayTripSegments = normalizeGroundSegmentProfilesBySpeed(
    replayTripSegments,
    replayTripPoints,
    trip.localId,
    new Date().toISOString(),
  );

  const oldDistanceMeters = trip.distanceMeters ?? getTripDistanceMeters(oldTripPoints, oldTripSegments, trip.localId);
  const newDistanceMeters = getTripDistanceMeters(replayTripPoints, replayTripSegments, trip.localId);
  const firstAcceptedRecordedAt = replayTripPoints[0]?.recordedAt ?? null;
  const lastAcceptedRecordedAt = replayTripPoints[replayTripPoints.length - 1]?.recordedAt ?? null;
  const warnings = buildWarnings({
    newDistanceMeters,
    newPointCount: replayTripPoints.length,
    oldDistanceMeters,
    oldPointCount: oldTripPoints.length,
    rawEvents: sortedRawEvents,
    trip,
  });

  if (replayTripPoints.length === 0 && oldTripPoints.length > 0) {
    warnings.push("Reprocessing produced zero accepted points.");
  }

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
      newPointCount: replayTripPoints.length,
      newSegmentCount: replayTripSegments.length,
      newSegments: buildSegmentSummaries(replayTripSegments, replayTripPoints, trip.localId),
      oldDistanceMeters,
      oldPointCount: oldTripPoints.length,
      oldSegmentCount: oldTripSegments.length,
      oldSegments: buildSegmentSummaries(oldTripSegments, oldTripPoints, trip.localId),
      processingTrace: replay.processingTrace,
      rawEventCount: sortedRawEvents.length,
      rejectedRawEventCount: replay.rejectedRawEventCount,
      tripLocalId: trip.localId,
      warnings,
    },
    processingResults: replay.processingResults,
    trip,
    tripPoints: replayTripPoints,
    tripSegments: replayTripSegments,
  };
}

export async function applyRawReprocessingResult(buildResult: RawReprocessingBuildResult): Promise<void> {
  await applyRawEventReprocessingUnitOfWork({
    distanceMeters: buildResult.preview.newDistanceMeters,
    pointCount: buildResult.preview.newPointCount,
    processingResults: buildResult.processingResults,
    trip: buildResult.trip,
    tripLocalId: buildResult.preview.tripLocalId,
    tripPoints: buildResult.tripPoints,
    tripSegments: buildResult.tripSegments,
    waypoints: buildResult.nextWaypoints,
  });
}

async function loadAndValidateReprocessingInput(tripLocalId: string): Promise<RawReprocessingInputModel> {
  const inputModel = await loadRawReprocessingInputModel(tripLocalId);

  if (!inputModel) {
    throw new Error("Trip was not found.");
  }

  if (
    inputModel.trip.status !== "ended" ||
    inputModel.trip.endedAt === null ||
    (inputModel.recordingSession?.status === "recording" &&
      inputModel.recordingSession.activeTripId === tripLocalId)
  ) {
    throw new Error("Only ended inactive trips can be reprocessed.");
  }

  return inputModel;
}

export async function previewRawEventReprocessing(tripLocalId: string): Promise<ReprocessingPreview> {
  const inputModel = await loadAndValidateReprocessingInput(tripLocalId);

  return buildRawReprocessingPreview(inputModel).preview;
}

export async function applyRawEventReprocessing(tripLocalId: string): Promise<ReprocessingPreview> {
  const inputModel = await loadAndValidateReprocessingInput(tripLocalId);
  const buildResult = buildRawReprocessingPreview(inputModel);

  if (buildResult.tripPoints.length === 0) {
    throw new Error("Reprocessing produced zero accepted points.");
  }

  await saveRawEventReprocessingUndoSnapshotForTrip(tripLocalId);
  await applyRawReprocessingResult(buildResult);

  return buildResult.preview;
}
