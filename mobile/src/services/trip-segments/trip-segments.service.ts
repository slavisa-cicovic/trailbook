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

interface TripSegmentStatsSummary {
  distance_meters: number;
  duration_ms: number;
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

const AUTO_MIN_PLANE_SEGMENT_MS = 30 * 60 * 1000;
const AUTO_MIN_DRIVE_SEGMENT_MS = 10 * 60 * 1000;

function getNextSyncStatus(currentStatus: TripSegment["syncStatus"]): TripSegment["syncStatus"] {
  return currentStatus === "local-only" ? "local-only" : "pending-sync";
}

function getNextEntitySyncStatus<T extends { syncStatus: "local-only" | "pending-sync" | "synced" | "sync-error" }>(
  entity: T,
): T["syncStatus"] {
  return entity.syncStatus === "local-only" ? "local-only" : "pending-sync";
}

function isGroundProfile(profile: RecordingProfile) {
  return profile === "walk" || profile === "bike" || profile === "drive";
}

function isRecordedAtWithinSegment(tripPoint: TripPoint, segment: TripSegment) {
  const recordedAtMs = new Date(tripPoint.recordedAt).getTime();
  const startedAtMs = new Date(segment.startedAt).getTime();
  const endedAtMs = new Date(segment.endedAt ?? tripPoint.recordedAt).getTime();

  if (Number.isNaN(recordedAtMs) || Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs)) {
    return false;
  }

  return recordedAtMs >= startedAtMs && recordedAtMs <= endedAtMs;
}

function resolveShortDriveFallback(
  orderedTripSegments: TripSegment[],
  targetIndex: number,
): RecordingProfile | null {
  const previousProfile = targetIndex > 0 ? orderedTripSegments[targetIndex - 1]?.recordingProfile ?? null : null;
  const nextProfile =
    targetIndex < orderedTripSegments.length - 1
      ? orderedTripSegments[targetIndex + 1]?.recordingProfile ?? null
      : null;

  if (previousProfile && nextProfile && previousProfile === nextProfile && isGroundProfile(previousProfile)) {
    return previousProfile;
  }

  if (previousProfile && isGroundProfile(previousProfile)) {
    return previousProfile;
  }

  if (nextProfile && isGroundProfile(nextProfile)) {
    return nextProfile;
  }

  return null;
}

export function createInitialTripSegment(trip: Trip, startedAt: string): TripSegment {
  return {
    localId: `trip-segment-${startedAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    recordingProfile: trip.recordingProfile,
    pointCount: 0,
    distanceMeters: 0,
    durationMs: 0,
    statsUpdatedAt: startedAt,
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

export function finalizeEndedTripSegments(
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  tripLocalId: string,
  endedAt: string,
): TripSegment[] {
  const pointCountBySegmentId = new Map<string, number>();

  for (const tripPoint of tripPoints) {
    if (tripPoint.tripLocalId !== tripLocalId || !tripPoint.segmentLocalId) {
      continue;
    }

    pointCountBySegmentId.set(
      tripPoint.segmentLocalId,
      (pointCountBySegmentId.get(tripPoint.segmentLocalId) ?? 0) + 1,
    );
  }

  const tripSegmentIds = new Set(
    tripSegments
      .filter((segment) => segment.tripLocalId === tripLocalId)
      .map((segment) => segment.localId),
  );
  const removableEmptySegmentIds = new Set<string>();

  if (tripSegmentIds.size > 1) {
    for (const segmentId of tripSegmentIds) {
      if ((pointCountBySegmentId.get(segmentId) ?? 0) === 0) {
        removableEmptySegmentIds.add(segmentId);
      }
    }
  }

  return tripSegments
    .filter((segment) => segment.tripLocalId !== tripLocalId || !removableEmptySegmentIds.has(segment.localId))
    .map((segment) =>
      segment.tripLocalId === tripLocalId && segment.endedAt === null
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
    pointCount: 0,
    distanceMeters: 0,
    durationMs: 0,
    statsUpdatedAt: startedAt,
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
  const segmentsByLocalId = new Map<string, TripSegment>();

  for (const segment of tripSegments) {
    if (segment.tripLocalId === tripLocalId) {
      segmentsByLocalId.set(segment.localId, segment);
    }
  }

  return Array.from(segmentsByLocalId.values())
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
  segmentStatsBySegmentId?: Map<string, TripSegmentStatsSummary>,
): TripSegmentSummary[] {
  return getVisibleTripSegmentsForTrip(tripSegments, tripLocalId).map((segment) => {
    const segmentStats = segmentStatsBySegmentId?.get(segment.localId) ?? null;
    const hasStoredStats = segmentStats || (segment.distanceMeters !== null && segment.durationMs !== null);
    const segmentTripPoints = hasStoredStats
      ? []
      : getVisibleTripPointsForTrip(tripPoints, tripLocalId).filter(
          (tripPoint) => tripPoint.segmentLocalId === segment.localId,
        );
    const durationMs =
      segmentStats && segment.endedAt
        ? segmentStats.duration_ms
        : segment.durationMs !== null && segment.endedAt
          ? segment.durationMs
          : getSegmentDurationMs(segment);

    return {
      segment,
      distanceMeters:
        segmentStats?.distance_meters ??
        segment.distanceMeters ??
        calculateTripDistanceMeters(segmentTripPoints),
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
  const visibleTripPoints = getVisibleTripPointsForTrip(tripPoints, tripLocalId);
  const segmentPolylines = getVisibleTripSegmentsForTrip(tripSegments, tripLocalId)
    .map((segment) => {
      const coordinates = visibleTripPoints
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
  const segmentlessCoordinates = visibleTripPoints
    .filter((tripPoint) => tripPoint.segmentLocalId === null)
    .map((tripPoint) => ({
      latitude: tripPoint.latitude,
      longitude: tripPoint.longitude,
    }));

  if (segmentlessCoordinates.length <= 1) {
    return segmentPolylines;
  }

  return [
    ...segmentPolylines,
    {
      segmentLocalId: `${tripLocalId}:segmentless`,
      coordinates: segmentlessCoordinates,
      color: getRecordingProfileColor(DEFAULT_RECORDING_PROFILE),
    },
  ];
}

export function assignMissingTripPointSegments(
  tripPoints: TripPoint[],
  tripSegments: TripSegment[],
  tripLocalId: string,
): TripPoint[] {
  const orderedSegments = getVisibleTripSegmentsForTrip(tripSegments, tripLocalId);

  if (orderedSegments.length === 0) {
    return tripPoints;
  }

  let changed = false;
  const nextTripPoints = tripPoints.map((tripPoint) => {
    if (tripPoint.tripLocalId !== tripLocalId || tripPoint.segmentLocalId !== null) {
      return tripPoint;
    }

    const recordedAtMs = new Date(tripPoint.recordedAt).getTime();

    if (Number.isNaN(recordedAtMs)) {
      return tripPoint;
    }

    const matchingSegment = orderedSegments.find((segment) => {
      const startedAtMs = new Date(segment.startedAt).getTime();
      const endedAtMs = segment.endedAt ? new Date(segment.endedAt).getTime() : Number.POSITIVE_INFINITY;

      return !Number.isNaN(startedAtMs) && !Number.isNaN(endedAtMs) && recordedAtMs >= startedAtMs && recordedAtMs <= endedAtMs;
    });

    if (!matchingSegment) {
      return tripPoint;
    }

    changed = true;
    return {
      ...tripPoint,
      segmentLocalId: matchingSegment.localId,
      syncStatus: tripPoint.syncStatus === "synced" ? "pending-sync" : tripPoint.syncStatus,
    };
  });

  return changed ? nextTripPoints : tripPoints;
}

function inferSegmentlessProfile(tripPoints: TripPoint[]): RecordingProfile {
  const speedsKmh = tripPoints
    .map((tripPoint) => tripPoint.speed)
    .filter((speed): speed is number => speed !== null && Number.isFinite(speed) && speed > 0)
    .map((speed) => speed * 3.6)
    .sort((left, right) => left - right);

  if (speedsKmh.length === 0) {
    return DEFAULT_RECORDING_PROFILE;
  }

  const medianSpeedKmh = speedsKmh[Math.floor(speedsKmh.length / 2)];

  if (medianSpeedKmh >= 28) {
    return "drive";
  }

  if (medianSpeedKmh >= 8.5 && medianSpeedKmh <= 35) {
    return "bike";
  }

  return DEFAULT_RECORDING_PROFILE;
}

function createRecoveredTripSegment(
  trip: Pick<Trip, "deviceId" | "localId" | "userId">,
  tripPoints: TripPoint[],
  recordingProfile: RecordingProfile,
): TripSegment {
  const sortedTripPoints = [...tripPoints].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const startedAt = sortedTripPoints[0]?.recordedAt ?? new Date().toISOString();
  const endedAt = sortedTripPoints[sortedTripPoints.length - 1]?.recordedAt ?? startedAt;

  return {
    localId: `trip-segment-recovered-${startedAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    recordingProfile,
    pointCount: 0,
    distanceMeters: 0,
    durationMs: 0,
    statsUpdatedAt: startedAt,
    startedAt,
    endedAt,
    createdAt: startedAt,
    updatedAt: endedAt,
    syncStatus: "local-only",
  };
}

function groupSegmentlessTripPoints(tripPoints: TripPoint[]): TripPoint[][] {
  const sortedTripPoints = [...tripPoints].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const groups: TripPoint[][] = [];

  for (const tripPoint of sortedTripPoints) {
    const currentGroup = groups[groups.length - 1];
    const previousPoint = currentGroup?.[currentGroup.length - 1] ?? null;
    const gapMs = previousPoint
      ? new Date(tripPoint.recordedAt).getTime() - new Date(previousPoint.recordedAt).getTime()
      : 0;

    if (!currentGroup || !Number.isFinite(gapMs) || gapMs > 3 * 60 * 1000) {
      groups.push([tripPoint]);
    } else {
      currentGroup.push(tripPoint);
    }
  }

  return groups;
}

export function recoverSegmentlessTripSections(
  trip: Pick<Trip, "deviceId" | "localId" | "userId">,
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
): { tripPoints: TripPoint[]; tripSegments: TripSegment[] } {
  const segmentlessTripPoints = tripPoints.filter(
    (tripPoint) => tripPoint.tripLocalId === trip.localId && tripPoint.segmentLocalId === null,
  );

  if (segmentlessTripPoints.length === 0) {
    return { tripPoints, tripSegments };
  }

  let nextTripSegments = tripSegments;
  let nextTripPoints = tripPoints;

  for (const group of groupSegmentlessTripPoints(segmentlessTripPoints)) {
    if (group.length < 2) {
      continue;
    }

    const inferredProfile = inferSegmentlessProfile(group);

    if (inferredProfile === DEFAULT_RECORDING_PROFILE) {
      continue;
    }

    const recoveredSegment = createRecoveredTripSegment(trip, group, inferredProfile);
    nextTripSegments = [...nextTripSegments, recoveredSegment];
    const recoveredPointIds = new Set(group.map((tripPoint) => tripPoint.localId));
    nextTripPoints = nextTripPoints.map((tripPoint) =>
      recoveredPointIds.has(tripPoint.localId)
        ? {
            ...tripPoint,
            segmentLocalId: recoveredSegment.localId,
            syncStatus: tripPoint.syncStatus === "synced" ? "pending-sync" : tripPoint.syncStatus,
          }
        : tripPoint,
    );
  }

  const assignedTripPoints = assignMissingTripPointSegments(nextTripPoints, nextTripSegments, trip.localId);

  return {
    tripPoints: assignedTripPoints,
    tripSegments: nextTripSegments,
  };
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
  const mergedSegmentsByLocalId = new Map(segmentsToMerge.map((segment) => [segment.localId, segment]));

  const nextTripSegments = tripSegments
    .filter((segment) => !removedSegmentIds.has(segment.localId))
    .map((segment) =>
      segment.localId === survivingSegment.localId
        ? survivingSegment
        : segment,
    );

  const nextTripPoints = tripPoints.map((tripPoint) =>
    tripPoint.tripLocalId === tripLocalId &&
    ((tripPoint.segmentLocalId && removedSegmentIds.has(tripPoint.segmentLocalId)) ||
      (!tripPoint.segmentLocalId &&
        segmentsToMerge.some((segment) => isRecordedAtWithinSegment(tripPoint, segment))) ||
      (tripPoint.segmentLocalId !== null &&
        mergedSegmentsByLocalId.has(tripPoint.segmentLocalId) &&
        isRecordedAtWithinSegment(tripPoint, mergedSegmentsByLocalId.get(tripPoint.segmentLocalId)!)))
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

export function normalizeAutoClosedTripSegment(
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  waypoints: Waypoint[],
  tripLocalId: string,
  updatedAt: string,
): UpdateTripSegmentModeResult {
  const orderedTripSegments = getVisibleTripSegmentsForTrip(tripSegments, tripLocalId);
  const targetIndex = [...orderedTripSegments]
    .map((segment, index) => ({ index, segment }))
    .reverse()
    .find(({ segment }) => segment.endedAt !== null)?.index;

  if (targetIndex === undefined) {
    return {
      tripSegments,
      tripPoints,
      waypoints,
    };
  }

  const targetSegment = orderedTripSegments[targetIndex];
  const targetSummary = buildTripSegmentsSummary(tripSegments, tripPoints, tripLocalId).find(
    (summary) => summary.segment.localId === targetSegment.localId,
  );

  if (!targetSummary) {
    return {
      tripSegments,
      tripPoints,
      waypoints,
    };
  }

  if (targetSegment.recordingProfile === "plane" && targetSummary.durationMs < AUTO_MIN_PLANE_SEGMENT_MS) {
    return updateTripSegmentMode(
      tripSegments,
      tripPoints,
      waypoints,
      tripLocalId,
      targetSegment.localId,
      "drive",
      updatedAt,
    );
  }

  if (targetSegment.recordingProfile === "drive" && targetSummary.durationMs < AUTO_MIN_DRIVE_SEGMENT_MS) {
    const fallbackProfile = resolveShortDriveFallback(orderedTripSegments, targetIndex);

    if (fallbackProfile && fallbackProfile !== "drive") {
      return updateTripSegmentMode(
        tripSegments,
        tripPoints,
        waypoints,
        tripLocalId,
        targetSegment.localId,
        fallbackProfile,
        updatedAt,
      );
    }
  }

  return {
    tripSegments,
    tripPoints,
    waypoints,
  };
}
