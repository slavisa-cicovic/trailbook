import {
  DEFAULT_RECORDING_PROFILE,
  getRecordingProfileColor,
  getRecordingProfileLabel,
} from "../../constants/recording-profiles";
import type { RecordingProfile, Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import { calculateTripDistanceMeters, getVisibleTripPointsForTrip } from "../trip-points/trip-points.service";
import { formatDurationSummary } from "../trips/trips-management.service";

export interface TripSegmentSummary {
  distanceMeters: number;
  durationLabel: string;
  durationMs: number;
  segment: TripSegment;
}

function getSegmentDurationMs(segment: TripSegment): number {
  const startedAt = new Date(segment.startedAt).getTime();
  const endedAt = new Date(segment.endedAt ?? new Date().toISOString()).getTime();

  if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
    return 0;
  }

  return endedAt - startedAt;
}

export interface SegmentPolyline {
  color: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
  segmentLocalId: string;
}

export interface UpdateTripSegmentModeResult {
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
}

function getNextSyncStatus(currentStatus: TripSegment["syncStatus"]): TripSegment["syncStatus"] {
  return currentStatus === "local-only" ? "local-only" : "pending-sync";
}

function getNextEntitySyncStatus<T extends { syncStatus: "local-only" | "pending-sync" | "synced" | "sync-error" }>(
  entity: T,
): T["syncStatus"] {
  return entity.syncStatus === "local-only" ? "local-only" : "pending-sync";
}

export function createInitialTripSegment(trip: Trip, startedAt: string): TripSegment {
  return {
    localId: `trip-segment-${startedAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    recordingProfile: trip.recordingProfile,
    startedAt,
    endedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    syncStatus: "local-only",
  };
}

export function closeActiveTripSegment(
  tripSegments: TripSegment[],
  activeSegmentId: string,
  endedAt: string,
): TripSegment[] {
  return tripSegments.map((segment) =>
    segment.localId === activeSegmentId
      ? {
          ...segment,
          endedAt,
          updatedAt: endedAt,
          syncStatus: "pending-sync",
        }
      : segment,
  );
}

export function startNextTripSegment(
  trip: Trip,
  tripSegments: TripSegment[],
  recordingProfile: RecordingProfile,
  startedAt: string,
): { nextSegment: TripSegment; tripSegments: TripSegment[] } {
  const nextSegment: TripSegment = {
    localId: `trip-segment-${startedAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    recordingProfile,
    startedAt,
    endedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    syncStatus: "local-only",
  };

  return {
    nextSegment,
    tripSegments: [...tripSegments, nextSegment],
  };
}

export function getVisibleTripSegmentsForTrip(
  tripSegments: TripSegment[],
  tripLocalId: string,
): TripSegment[] {
  return tripSegments
    .filter((segment) => segment.tripLocalId === tripLocalId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function getOpenTripSegmentForTrip(
  tripSegments: TripSegment[],
  tripLocalId: string,
): TripSegment | null {
  return (
    [...tripSegments]
      .reverse()
      .find((segment) => segment.tripLocalId === tripLocalId && segment.endedAt === null) ?? null
  );
}

export function buildTripSegmentsSummary(
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  tripLocalId: string,
): TripSegmentSummary[] {
  return getVisibleTripSegmentsForTrip(tripSegments, tripLocalId).map((segment) => {
    const segmentTripPoints = getVisibleTripPointsForTrip(tripPoints, tripLocalId).filter(
      (tripPoint) => tripPoint.segmentLocalId === segment.localId,
    );
    const durationMs = getSegmentDurationMs(segment);

    return {
      segment,
      distanceMeters: calculateTripDistanceMeters(segmentTripPoints),
      durationMs,
      durationLabel: formatDurationSummary(durationMs),
    };
  });
}

export function buildTripModeSummary(tripSegments: TripSegment[], tripLocalId: string): string {
  const orderedSegments = getVisibleTripSegmentsForTrip(tripSegments, tripLocalId);

  if (orderedSegments.length === 0) {
    return getRecordingProfileLabel(DEFAULT_RECORDING_PROFILE);
  }

  const categoryLabels = orderedSegments.reduce<string[]>((labels, segment) => {
    const nextLabel = getRecordingProfileLabel(segment.recordingProfile);

    if (!labels.includes(nextLabel)) {
      labels.push(nextLabel);
    }

    return labels;
  }, []);

  return categoryLabels.join(" + ");
}

export function buildSegmentPolylines(
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  tripLocalId: string,
): SegmentPolyline[] {
  return getVisibleTripSegmentsForTrip(tripSegments, tripLocalId)
    .map((segment) => {
      const coordinates = getVisibleTripPointsForTrip(tripPoints, tripLocalId)
        .filter((tripPoint) => tripPoint.segmentLocalId === segment.localId)
        .map((tripPoint) => ({
          latitude: tripPoint.latitude,
          longitude: tripPoint.longitude,
        }));

      return {
        segmentLocalId: segment.localId,
        coordinates,
        color: getRecordingProfileColor(segment.recordingProfile),
      };
    })
    .filter((segment) => segment.coordinates.length > 1);
}

export function updateTripSegmentMode(
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  waypoints: Waypoint[],
  tripLocalId: string,
  segmentLocalId: string,
  recordingProfile: RecordingProfile,
  updatedAt: string,
): UpdateTripSegmentModeResult {
  const orderedTripSegments = getVisibleTripSegmentsForTrip(tripSegments, tripLocalId);
  const targetIndex = orderedTripSegments.findIndex((segment) => segment.localId === segmentLocalId);

  if (targetIndex === -1) {
    throw new Error("The selected segment could not be found.");
  }

  const updatedOrderedSegments = orderedTripSegments.map((segment) =>
    segment.localId === segmentLocalId
      ? {
          ...segment,
          recordingProfile,
          updatedAt,
          syncStatus: getNextSyncStatus(segment.syncStatus),
        }
      : segment,
  );

  let mergeStartIndex = targetIndex;
  let mergeEndIndex = targetIndex;

  while (
    mergeStartIndex > 0 &&
    updatedOrderedSegments[mergeStartIndex - 1].recordingProfile ===
      updatedOrderedSegments[targetIndex].recordingProfile
  ) {
    mergeStartIndex -= 1;
  }

  while (
    mergeEndIndex < updatedOrderedSegments.length - 1 &&
    updatedOrderedSegments[mergeEndIndex + 1].recordingProfile ===
      updatedOrderedSegments[targetIndex].recordingProfile
  ) {
    mergeEndIndex += 1;
  }

  const segmentsToMerge = updatedOrderedSegments.slice(mergeStartIndex, mergeEndIndex + 1);
  const survivingSegment = {
    ...segmentsToMerge[0],
    recordingProfile,
    startedAt: segmentsToMerge[0].startedAt,
    endedAt: segmentsToMerge[segmentsToMerge.length - 1].endedAt,
    updatedAt,
    syncStatus: getNextSyncStatus(segmentsToMerge[0].syncStatus),
  };
  const removedSegmentIds = new Set(segmentsToMerge.slice(1).map((segment) => segment.localId));

  const nextTripSegments = tripSegments
    .filter((segment) => !removedSegmentIds.has(segment.localId))
    .map((segment) =>
      segment.localId === survivingSegment.localId
        ? survivingSegment
        : segment,
    );

  const nextTripPoints = tripPoints.map((tripPoint) =>
    tripPoint.tripLocalId === tripLocalId && tripPoint.segmentLocalId && removedSegmentIds.has(tripPoint.segmentLocalId)
      ? {
          ...tripPoint,
          segmentLocalId: survivingSegment.localId,
          syncStatus: getNextEntitySyncStatus(tripPoint),
        }
      : tripPoint,
  );

  const nextWaypoints = waypoints.map((waypoint) =>
    waypoint.tripLocalId === tripLocalId && waypoint.segmentLocalId && removedSegmentIds.has(waypoint.segmentLocalId)
      ? {
          ...waypoint,
          segmentLocalId: survivingSegment.localId,
          updatedAt,
          syncStatus: getNextEntitySyncStatus(waypoint),
        }
      : waypoint,
  );

  return {
    tripSegments: nextTripSegments,
    tripPoints: nextTripPoints,
    waypoints: nextWaypoints,
  };
}
