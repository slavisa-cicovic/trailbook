import type { Segment } from '../model/segment';
import type { GeoPoint } from './types';
import { V1 } from './types';
import { shouldConnectGeoPoints } from './locationCleaner';

interface RawSegment {
  startTime: Date;
  endTime: Date;
  type: Segment['segmentType'];
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceInRange(points: GeoPoint[], from: Date, to: Date): number {
  const inRange = points.filter(
    (p) => p.timestamp.getTime() >= from.getTime() && p.timestamp.getTime() <= to.getTime(),
  );
  let total = 0;
  for (let i = 1; i < inRange.length; i++) {
    if (!shouldConnectGeoPoints(inRange[i - 1], inRange[i])) {
      continue;
    }
    total += haversineM(
      inRange[i - 1].latitude,
      inRange[i - 1].longitude,
      inRange[i].latitude,
      inRange[i].longitude,
    );
  }
  return total;
}

export function mergeAndFinalize(
  tripId: string,
  rawSegments: RawSegment[],
  geoPoints: GeoPoint[],
): Segment[] {
  if (!rawSegments.length) return [];

  // A short low-speed interruption between confirmed drive segments is usually
  // traffic, parking manoeuvring, or sparse callbacks rather than a true mode change.
  const driveStable = absorbDriveInterruptions(rawSegments);

  // Sparse slow movement should not be labelled as cycling solely because one
  // reported speed crossed the walk threshold.
  const movementNormalized = absorbDriveAdjacentBikeSegments(
    normalizeSlowBikeSegments(driveStable, geoPoints),
  );

  // Merge consecutive same-type segments with gap < threshold.
  const merged: RawSegment[] = [{ ...movementNormalized[0] }];
  for (let i = 1; i < movementNormalized.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = movementNormalized[i];
    const gapMs = curr.startTime.getTime() - prev.endTime.getTime();
    if (prev.type === curr.type && gapMs <= V1.mergeGapThresholdMs) {
      prev.endTime = curr.endTime;
    } else {
      merged.push({ ...curr });
    }
  }

  const withStationaryGaps = insertStationaryGaps(merged, geoPoints);

  // Post-process 1: remove leading/trailing STATIONARY when there is movement
  const trimmed = trimBoundaryStationary(withStationaryGaps);

  // Post-process 2: absorb short isolated segments sandwiched between same-type neighbours.
  const stationaryCorrected = absorbWalkStationaryInterruptions(trimmed, geoPoints);
  const movingStationaryCorrected = reclassifyMovingStationarySegments(stationaryCorrected, geoPoints);
  const remerged = mergeConsecutiveSameType(movingStationaryCorrected, geoPoints);
  const absorbed = absorbIsolated(remerged);

  // Finalize: assign index + distanceM
  return absorbed.map((seg, idx) => ({
    tripId,
    index: idx,
    segmentType: seg.type,
    startedAt: seg.startTime,
    endedAt: seg.endTime,
    distanceM: distanceInRange(geoPoints, seg.startTime, seg.endTime),
  }));
}

function mergeConsecutiveSameType(segments: RawSegment[], geoPoints: GeoPoint[]): RawSegment[] {
  if (segments.length <= 1) return segments;

  const result: RawSegment[] = [{ ...segments[0] }];
  for (const segment of segments.slice(1)) {
    const previous = result[result.length - 1];
    const gapMs = segment.startTime.getTime() - previous.endTime.getTime();
    if (
      previous.type === segment.type &&
      (gapMs <= V1.mergeGapThresholdMs || shouldMergeSparseSameType(previous, segment, geoPoints))
    ) {
      previous.endTime = segment.endTime;
    } else {
      result.push({ ...segment });
    }
  }
  return result;
}

function shouldMergeSparseSameType(
  previous: RawSegment,
  current: RawSegment,
  geoPoints: GeoPoint[],
) {
  if (previous.type !== 'WALK' || current.type !== 'WALK') return false;

  const gapMs = current.startTime.getTime() - previous.endTime.getTime();
  if (gapMs <= V1.mergeGapThresholdMs || gapMs > V1.walkSparseMergeMaxMs) return false;

  const before = findNearestPointAtOrBefore(geoPoints, previous.endTime);
  const after = findNearestPointAtOrAfter(geoPoints, current.startTime);
  if (!before || !after) return false;

  return (
    haversineM(before.latitude, before.longitude, after.latitude, after.longitude) <=
    V1.walkSparseMergeMaxDistanceM
  );
}

function classifyByAverageSpeed(speedMps: number): Segment['segmentType'] {
  if (speedMps < V1.stationaryMaxMps) return 'STATIONARY';
  if (speedMps < V1.walkMaxMps) return 'WALK';
  if (speedMps < V1.bikeMaxMps) return 'BIKE';
  return 'DRIVE';
}

function reclassifyMovingStationarySegments(
  segments: RawSegment[],
  geoPoints: GeoPoint[],
): RawSegment[] {
  return segments.map((segment, index) => {
    if (segment.type !== 'STATIONARY') return segment;

    const durationSeconds =
      (segment.endTime.getTime() - segment.startTime.getTime()) / 1000;
    if (durationSeconds <= 0) return segment;

    const distanceM = distanceInRange(geoPoints, segment.startTime, segment.endTime);
    if (distanceM <= V1.stationarySegmentMaxDistanceM) return segment;

    const averageSpeedMps = distanceM / durationSeconds;
    const speedType = classifyByAverageSpeed(averageSpeedMps);
    if (speedType === 'STATIONARY') return segment;

    const previous = segments[index - 1];
    const next = segments[index + 1];
    if (
      speedType === 'BIKE' &&
      averageSpeedMps >= V1.walkMaxMps &&
      (previous?.type === 'DRIVE' || next?.type === 'DRIVE')
    ) {
      return { ...segment, type: 'DRIVE' };
    }

    return { ...segment, type: speedType };
  });
}

function absorbDriveAdjacentBikeSegments(segments: RawSegment[]): RawSegment[] {
  if (segments.length < 2) return segments.map((segment) => ({ ...segment }));

  return segments.map((segment, index) => {
    if (segment.type !== 'BIKE') return segment;

    const durationMs = segment.endTime.getTime() - segment.startTime.getTime();
    if (durationMs > V1.driveAdjacentBikeMaxMs) return segment;

    const previous = segments[index - 1];
    const next = segments[index + 1];
    if (previous?.type === 'DRIVE' || next?.type === 'DRIVE') {
      return { ...segment, type: 'DRIVE' };
    }

    return segment;
  });
}

function absorbDriveInterruptions(segments: RawSegment[]): RawSegment[] {
  if (segments.length < 3) return segments.map((segment) => ({ ...segment }));

  const result = segments.map((segment) => ({ ...segment }));

  for (let index = 1; index < result.length - 1; index += 1) {
    const previous = result[index - 1];
    const current = result[index];
    const next = result[index + 1];
    const durationMs = current.endTime.getTime() - current.startTime.getTime();
    const previousGapMs = current.startTime.getTime() - previous.endTime.getTime();
    const nextGapMs = next.startTime.getTime() - current.endTime.getTime();

    if (
      previous.type === 'DRIVE' &&
      next.type === 'DRIVE' &&
      durationMs <= V1.driveInterruptionMaxMs &&
      previousGapMs <= V1.mergeGapThresholdMs &&
      nextGapMs <= V1.mergeGapThresholdMs
    ) {
      current.type = 'DRIVE';
    }
  }

  return result;
}

function normalizeSlowBikeSegments(
  segments: RawSegment[],
  geoPoints: GeoPoint[],
): RawSegment[] {
  return segments.map((segment) => {
    if (segment.type !== 'BIKE') return segment;

    const durationSeconds =
      (segment.endTime.getTime() - segment.startTime.getTime()) / 1000;
    if (durationSeconds <= 0) return segment;

    const averageSpeedMps =
      distanceInRange(geoPoints, segment.startTime, segment.endTime) / durationSeconds;

    if (averageSpeedMps < V1.stationaryMaxMps) {
      return { ...segment, type: 'STATIONARY' };
    }
    if (averageSpeedMps < V1.bikeMinAverageMps) {
      const reportedAverageSpeedMps = averageReportedSpeedInRange(
        geoPoints,
        segment.startTime,
        segment.endTime,
      );
      if (
        reportedAverageSpeedMps !== null &&
        reportedAverageSpeedMps >= V1.walkMaxMps
      ) {
        return segment;
      }
      return { ...segment, type: 'WALK' };
    }
    return segment;
  });
}

function averageReportedSpeedInRange(points: GeoPoint[], from: Date, to: Date): number | null {
  const speeds = points
    .filter(
      (point) =>
        point.timestamp.getTime() >= from.getTime() &&
        point.timestamp.getTime() <= to.getTime() &&
        point.speedMps !== undefined &&
        point.speedMps >= 0,
    )
    .map((point) => point.speedMps as number);

  if (!speeds.length) return null;
  return speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
}

function insertStationaryGaps(segments: RawSegment[], geoPoints: GeoPoint[]): RawSegment[] {
  if (segments.length < 2) return segments;

  const result: RawSegment[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const current = segments[index];
    const previous = result[result.length - 1];

    if (previous) {
      const gapMs = current.startTime.getTime() - previous.endTime.getTime();
      if (gapMs >= V1.stationaryGapMinDurationMs) {
        const before = findNearestPointAtOrBefore(geoPoints, previous.endTime);
        const after = findNearestPointAtOrAfter(geoPoints, current.startTime);
        const boundaryDistanceM =
          before && after
            ? haversineM(before.latitude, before.longitude, after.latitude, after.longitude)
            : null;

        if (
          boundaryDistanceM !== null &&
          boundaryDistanceM <= V1.stationaryGapMaxDistanceM &&
          previous.type !== 'STATIONARY' &&
          current.type !== 'STATIONARY'
        ) {
          result.push({
            startTime: previous.endTime,
            endTime: current.startTime,
            type: 'STATIONARY',
          });
        }
      }
    }

    result.push(current);
  }

  return result;
}

function findNearestPointAtOrBefore(points: GeoPoint[], timestamp: Date): GeoPoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].timestamp.getTime() <= timestamp.getTime()) {
      return points[index];
    }
  }
  return null;
}

function findNearestPointAtOrAfter(points: GeoPoint[], timestamp: Date): GeoPoint | null {
  for (const point of points) {
    if (point.timestamp.getTime() >= timestamp.getTime()) {
      return point;
    }
  }
  return null;
}

function trimBoundaryStationary(segments: RawSegment[]): RawSegment[] {
  if (segments.length <= 1) return segments;
  const hasMovement = segments.some((s) => s.type !== 'STATIONARY');
  if (!hasMovement) return segments;

  let result = [...segments];

  while (result.length > 1 && result[0].type === 'STATIONARY') {
    result = result.slice(1);
  }
  while (result.length > 1 && result[result.length - 1].type === 'STATIONARY') {
    result = result.slice(0, -1);
  }

  return result;
}

function absorbIsolated(segments: RawSegment[]): RawSegment[] {
  if (segments.length < 3) return segments;

  let result = [...segments];
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 1; i < result.length - 1; i++) {
      const prev = result[i - 1];
      const curr = result[i];
      const next = result[i + 1];
      if (prev.type === next.type) {
        const durationMs = curr.endTime.getTime() - curr.startTime.getTime();
        if (durationMs <= V1.isoSegmentAbsorbMaxMs) {
          result.splice(i - 1, 3, { startTime: prev.startTime, endTime: next.endTime, type: prev.type });
          changed = true;
          break;
        }
      }
    }
  }

  return result;
}

function absorbWalkStationaryInterruptions(
  segments: RawSegment[],
  geoPoints: GeoPoint[],
): RawSegment[] {
  if (segments.length < 3) return segments;

  return segments.map((segment, index) => {
    const previous = segments[index - 1];
    const next = segments[index + 1];
    if (
      !previous ||
      !next ||
      previous.type !== 'WALK' ||
      segment.type !== 'STATIONARY' ||
      next.type !== 'WALK'
    ) {
      return segment;
    }

    const durationMs = segment.endTime.getTime() - segment.startTime.getTime();
    if (durationMs > V1.walkStationaryInterruptionMaxMs) {
      return segment;
    }

    const distanceM = distanceInRange(geoPoints, segment.startTime, segment.endTime);
    if (distanceM < V1.walkStationaryInterruptionMinDistanceM) {
      return segment;
    }

    return { ...segment, type: 'WALK' };
  });
}
