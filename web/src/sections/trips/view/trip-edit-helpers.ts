import type { UserTripDetail } from "../../../lib/auth-api";

export type DraftTripEdit = {
  trip: {
    id: string;
    title: string;
    description: string | null;
    recordingProfile: UserTripDetail["trip"]["recordingProfile"];
    startedAt: string;
    endedAt: string | null;
    updatedAt: string;
    syncStatus: UserTripDetail["trip"]["syncStatus"];
  };
  summary: UserTripDetail["summary"];
  points: UserTripDetail["points"];
  segments: UserTripDetail["segments"];
  waypoints: UserTripDetail["waypoints"];
  pauses: UserTripDetail["pauses"];
};

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function calculateDistanceMeters(points: Array<{ latitude: number; longitude: number }>) {
  if (points.length < 2) {
    return 0;
  }

  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const deltaLatitude = toRadians(current.latitude - previous.latitude);
    const deltaLongitude = toRadians(current.longitude - previous.longitude);
    const latitudeA = toRadians(previous.latitude);
    const latitudeB = toRadians(current.latitude);
    const haversine =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;

    total += 2 * 6371000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }

  return total;
}

function projectRelativeMeters(
  origin: { latitude: number; longitude: number },
  target: { latitude: number; longitude: number },
) {
  const earthRadiusMeters = 6371000;
  const latitudeLeft = toRadians(origin.latitude);
  const latitudeTarget = toRadians(target.latitude);
  const longitudeLeft = toRadians(origin.longitude);
  const longitudeTarget = toRadians(target.longitude);
  const averageLatitude = (latitudeLeft + latitudeTarget) / 2;

  return {
    x: (longitudeTarget - longitudeLeft) * Math.cos(averageLatitude) * earthRadiusMeters,
    y: (latitudeTarget - latitudeLeft) * earthRadiusMeters,
  };
}

function calculatePerpendicularDeviationMeters(
  left: { latitude: number; longitude: number },
  middle: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  const middleProjection = projectRelativeMeters(left, middle);
  const rightProjection = projectRelativeMeters(left, right);
  const lineLengthSquared = rightProjection.x * rightProjection.x + rightProjection.y * rightProjection.y;

  if (lineLengthSquared <= 0) {
    return Math.sqrt(middleProjection.x * middleProjection.x + middleProjection.y * middleProjection.y);
  }

  const projectionFactor =
    (middleProjection.x * rightProjection.x + middleProjection.y * rightProjection.y) / lineLengthSquared;
  const clampedProjectionFactor = Math.max(0, Math.min(1, projectionFactor));
  const closestX = rightProjection.x * clampedProjectionFactor;
  const closestY = rightProjection.y * clampedProjectionFactor;
  const deviationX = middleProjection.x - closestX;
  const deviationY = middleProjection.y - closestY;

  return Math.sqrt(deviationX * deviationX + deviationY * deviationY);
}

function getSmoothingThresholds(recordingProfile: DraftTripEdit["trip"]["recordingProfile"]) {
  switch (recordingProfile) {
    case "walk":
      return {
        maxDeviationMeters: 8,
        maxDirectDistanceMeters: 55,
        maxExcessMeters: 16,
        maxNeighborDistanceMeters: 35,
        spikeMaxDirectDistanceMeters: 45,
        spikeMinExcessMeters: 28,
        spikeMinDeviationMeters: 14,
      };
    case "bike":
      return {
        maxDeviationMeters: 10,
        maxDirectDistanceMeters: 95,
        maxExcessMeters: 24,
        maxNeighborDistanceMeters: 60,
        spikeMaxDirectDistanceMeters: 50,
        spikeMinExcessMeters: 40,
        spikeMinDeviationMeters: 18,
      };
    default:
      return null;
  }
}

function getNextProfileColor(profile: DraftTripEdit["trip"]["recordingProfile"]) {
  switch (profile) {
    case "walk":
      return "#d4f542";
    case "bike":
      return "#2f6fed";
    case "drive":
      return "#d35400";
    case "boat":
      return "#138d75";
    case "plane":
      return "#7d3c98";
    case "stationary":
      return "#8a8173";
    default:
      return "#275f3b";
  }
}

export function getRecordingProfileColor(profile: DraftTripEdit["trip"]["recordingProfile"]) {
  return getNextProfileColor(profile);
}

export function buildDraftFromDetail(detail: UserTripDetail): DraftTripEdit {
  return JSON.parse(JSON.stringify(detail)) as DraftTripEdit;
}

export function recomputeDraftSummary(draft: DraftTripEdit): DraftTripEdit {
  const segmentDistances = draft.segments.map((segment) => ({
    localId: segment.localId,
    distanceMeters: calculateDistanceMeters(
      draft.points
        .filter((point) => point.segmentLocalId === segment.localId)
        .map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
    ),
  }));

  return {
    ...draft,
    summary: {
      distanceMeters: calculateDistanceMeters(draft.points),
      waypointCount: draft.waypoints.length,
      photoCount: draft.waypoints.reduce((total, waypoint) => total + waypoint.photoCount, 0),
      segmentCount: draft.segments.length,
    },
    segments: draft.segments.map((segment) => ({
      ...segment,
      distanceMeters: segmentDistances.find((entry) => entry.localId === segment.localId)?.distanceMeters ?? 0,
    })),
  };
}

export function updateDraftSegmentMode(
  draft: DraftTripEdit,
  segmentLocalId: string,
  recordingProfile: DraftTripEdit["trip"]["recordingProfile"],
): DraftTripEdit {
  const orderedSegments = [...draft.segments].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const targetIndex = orderedSegments.findIndex((segment) => segment.localId === segmentLocalId);

  if (targetIndex === -1) {
    return draft;
  }

  const updatedSegments = orderedSegments.map((segment) =>
    segment.localId === segmentLocalId ? { ...segment, recordingProfile } : segment,
  );

  let mergeStartIndex = targetIndex;
  let mergeEndIndex = targetIndex;

  while (
    mergeStartIndex > 0 &&
    updatedSegments[mergeStartIndex - 1]?.recordingProfile === updatedSegments[targetIndex]?.recordingProfile
  ) {
    mergeStartIndex -= 1;
  }

  while (
    mergeEndIndex < updatedSegments.length - 1 &&
    updatedSegments[mergeEndIndex + 1]?.recordingProfile === updatedSegments[targetIndex]?.recordingProfile
  ) {
    mergeEndIndex += 1;
  }

  const segmentsToMerge = updatedSegments.slice(mergeStartIndex, mergeEndIndex + 1);
  const survivor = {
    ...segmentsToMerge[0],
    recordingProfile,
    startedAt: segmentsToMerge[0].startedAt,
    endedAt: segmentsToMerge[segmentsToMerge.length - 1]?.endedAt ?? segmentsToMerge[0].endedAt,
  };
  const removedIds = new Set(segmentsToMerge.slice(1).map((segment) => segment.localId));

  return recomputeDraftSummary({
    ...draft,
    segments: updatedSegments
      .filter((segment) => !removedIds.has(segment.localId))
      .map((segment) => (segment.localId === survivor.localId ? survivor : segment)),
    points: draft.points.map((point) =>
      point.segmentLocalId && removedIds.has(point.segmentLocalId)
        ? { ...point, segmentLocalId: survivor.localId }
        : point,
    ),
    waypoints: draft.waypoints.map((waypoint) =>
      waypoint.segmentLocalId && removedIds.has(waypoint.segmentLocalId)
        ? { ...waypoint, segmentLocalId: survivor.localId }
        : waypoint,
    ),
  });
}

export function smoothDraftRoute(draft: DraftTripEdit): DraftTripEdit {
  const thresholds = getSmoothingThresholds(draft.trip.recordingProfile);

  if (!thresholds || draft.points.length < 3) {
    return draft;
  }

  let currentPoints = [...draft.points];
  const removedIds = new Set<string>();

  for (let pass = 0; pass < 2; pass += 1) {
    if (currentPoints.length < 3) {
      break;
    }

    const nextPoints = [currentPoints[0]];
    let removedThisPass = 0;

    for (let index = 1; index < currentPoints.length - 1; index += 1) {
      const left = nextPoints[nextPoints.length - 1]!;
      const middle = currentPoints[index]!;
      const right = currentPoints[index + 1]!;
      const leftToMiddle = calculateDistanceMeters([left, middle]);
      const middleToRight = calculateDistanceMeters([middle, right]);
      const leftToRight = calculateDistanceMeters([left, right]);
      const deviationMeters = calculatePerpendicularDeviationMeters(left, middle, right);
      const excessMeters = leftToMiddle + middleToRight - leftToRight;

      const spikeLikePoint =
        leftToRight <= thresholds.spikeMaxDirectDistanceMeters &&
        excessMeters >= thresholds.spikeMinExcessMeters &&
        deviationMeters >= thresholds.spikeMinDeviationMeters;

      const canDropPoint =
        spikeLikePoint ||
        (leftToMiddle <= thresholds.maxNeighborDistanceMeters &&
          middleToRight <= thresholds.maxNeighborDistanceMeters &&
          leftToRight <= thresholds.maxDirectDistanceMeters &&
          deviationMeters <= thresholds.maxDeviationMeters &&
          excessMeters <= thresholds.maxExcessMeters);

      if (canDropPoint) {
        removedIds.add(middle.localId);
        removedThisPass += 1;
        continue;
      }

      nextPoints.push(middle);
    }

    nextPoints.push(currentPoints[currentPoints.length - 1]!);
    currentPoints = nextPoints;

    if (removedThisPass === 0) {
      break;
    }
  }

  if (removedIds.size === 0) {
    return draft;
  }

  return recomputeDraftSummary({
    ...draft,
    points: draft.points.filter((point) => !removedIds.has(point.localId)),
  });
}

export function removeDraftPointRange(draft: DraftTripEdit, startIndex: number, endIndex: number): DraftTripEdit {
  if (draft.points.length < 3) {
    return draft;
  }

  const normalizedStart = Math.max(0, Math.min(startIndex, endIndex));
  const normalizedEnd = Math.min(draft.points.length - 1, Math.max(startIndex, endIndex));

  if (normalizedEnd - normalizedStart < 1) {
    return draft;
  }

  const removedPoints = draft.points.slice(normalizedStart, normalizedEnd + 1);
  const removedIds = new Set(removedPoints.map((point) => point.localId));
  const removedStartTime = removedPoints[0]?.recordedAt;
  const removedEndTime = removedPoints[removedPoints.length - 1]?.recordedAt;

  return recomputeDraftSummary({
    ...draft,
    points: draft.points.filter((point) => !removedIds.has(point.localId)),
    waypoints: draft.waypoints.filter((waypoint) => {
      if (!removedStartTime || !removedEndTime) {
        return true;
      }

      return waypoint.recordedAt < removedStartTime || waypoint.recordedAt > removedEndTime;
    }),
  });
}
