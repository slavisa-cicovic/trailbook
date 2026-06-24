import type { Segment } from '../model/segment';
import type { GeoPoint } from './types';
import { V1 } from './types';

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

  // Merge consecutive same-type segments with gap < threshold
  const merged: RawSegment[] = [{ ...rawSegments[0] }];
  for (let i = 1; i < rawSegments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = rawSegments[i];
    const gapMs = curr.startTime.getTime() - prev.endTime.getTime();
    if (prev.type === curr.type && gapMs <= V1.mergeGapThresholdMs) {
      prev.endTime = curr.endTime;
    } else {
      merged.push({ ...curr });
    }
  }

  // Post-process 1: remove leading/trailing STATIONARY when there is movement
  const trimmed = trimBoundaryStationary(merged);

  // Post-process 2: absorb short isolated segments sandwiched between same-type neighbours
  const absorbed = absorbIsolated(trimmed);

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

function trimBoundaryStationary(segments: RawSegment[]): RawSegment[] {
  if (segments.length <= 1) return segments;
  const hasMovement = segments.some((s) => s.type !== 'STATIONARY');
  if (!hasMovement) return segments;

  let result = [...segments];

  if (result[0].type === 'STATIONARY') {
    result = [{ ...result[1], startTime: result[0].startTime }, ...result.slice(2)];
  }

  if (result.length > 1 && result[result.length - 1].type === 'STATIONARY') {
    result = [
      ...result.slice(0, -2),
      { ...result[result.length - 2], endTime: result[result.length - 1].endTime },
    ];
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
