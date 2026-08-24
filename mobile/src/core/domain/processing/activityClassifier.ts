import type { RawActivitySample } from '../model/rawSamples';
import type { SegmentType } from '../model/segment';
import type { GeoPoint, ClassifiedInterval } from './types';
import { V1 } from './types';

// Android ActivityType integer constants (same as android app wire values)
const ACT_IN_VEHICLE = 0;
const ACT_ON_BICYCLE = 1;
const ACT_ON_FOOT    = 2;
const ACT_STILL      = 3;
const ACT_UNKNOWN    = 4;
const ACT_TILTING    = 5;
const ACT_WALKING    = 7;
const ACT_RUNNING    = 8;
const EARTH_RADIUS_M = 6_371_000;

function activityTypeToSegmentType(activityType: number): SegmentType | null {
  switch (activityType) {
    case ACT_IN_VEHICLE: return 'DRIVE';
    case ACT_ON_BICYCLE: return 'BIKE';
    case ACT_ON_FOOT:
    case ACT_WALKING:
    case ACT_RUNNING:    return 'WALK';
    case ACT_STILL:
    case ACT_TILTING:    return 'STATIONARY';
    case ACT_UNKNOWN:    return null; // fall through to speed heuristic
    default:             return null;
  }
}

function speedToSegmentType(speedMps: number | undefined): SegmentType {
  if (speedMps === undefined || speedMps < 0) return 'UNKNOWN';
  if (speedMps < V1.stationaryMaxMps) return 'STATIONARY';
  if (speedMps < V1.walkMaxMps)       return 'WALK';
  if (speedMps < V1.bikeMaxMps)       return 'BIKE';
  if (speedMps < V1.driveMaxMps)      return 'DRIVE';
  return 'DRIVE'; // > 50 m/s: PLANE heuristic future
}

function bestActivityEvidence(
  sample: RawActivitySample,
): { confidence: number; type: SegmentType } | null {
  if (!sample.results.length) return null;
  const best = sample.results.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
  if (best.confidence < 50) return null;
  const type = activityTypeToSegmentType(best.activityType);
  return type ? { confidence: best.confidence, type } : null;
}

function distanceM(start: GeoPoint, end: GeoPoint) {
  const dLat = ((end.latitude - start.latitude) * Math.PI) / 180;
  const dLon = ((end.longitude - start.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((start.latitude * Math.PI) / 180) *
      Math.cos((end.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function intervalSpeedMps(point: GeoPoint, next: GeoPoint) {
  const durationSeconds = (next.timestamp.getTime() - point.timestamp.getTime()) / 1000;
  if (durationSeconds <= 0) return undefined;

  const reportedSpeed =
    point.speedMps !== undefined && point.speedMps >= 0 ? point.speedMps : undefined;
  const impliedSpeed = distanceM(point, next) / durationSeconds;

  if (reportedSpeed === undefined) return impliedSpeed;
  return Math.max(reportedSpeed, impliedSpeed);
}

function reconcileActivityWithSpeed(
  activityType: SegmentType | null,
  speedMps: number | undefined,
) {
  const speedType = speedToSegmentType(speedMps);

  // A bicycle can realistically exceed the speed-only classification threshold,
  // especially downhill. Preserve a motion-confirmed BIKE until the measured
  // speed becomes implausible for cycling. WALK keeps the lower safety limit.
  if (speedMps !== undefined) {
    if (activityType === 'BIKE') {
      return speedMps >= V1.motionBikeHardMaxMps ? 'DRIVE' as const : 'BIKE' as const;
    }
    if (activityType === 'WALK' && speedMps >= V1.hardDriveMinMps) {
      return 'DRIVE' as const;
    }
  }

  return activityType ?? speedType;
}

function isMovingActivity(type: SegmentType | null) {
  return type === 'WALK' || type === 'BIKE' || type === 'DRIVE' || type === 'BOAT' || type === 'PLANE';
}

function detectDwellIntervals(geoPoints: GeoPoint[]) {
  const dwellIntervalIndexes = new Set<number>();

  for (let startIndex = 0; startIndex < geoPoints.length - 1; startIndex += 1) {
    let endIndex = startIndex + 1;

    while (endIndex < geoPoints.length) {
      const durationMs =
        geoPoints[endIndex].timestamp.getTime() - geoPoints[startIndex].timestamp.getTime();
      const distanceFromAnchor = distanceM(
        geoPoints[startIndex],
        geoPoints[endIndex],
      );

      if (distanceFromAnchor > V1.dwellStationaryRadiusM) {
        break;
      }

      if (durationMs >= V1.dwellStationaryMinDurationMs) {
        for (let intervalIndex = startIndex; intervalIndex < endIndex; intervalIndex += 1) {
          dwellIntervalIndexes.add(intervalIndex);
        }
      }

      endIndex += 1;
    }
  }

  return dwellIntervalIndexes;
}

export function classifyIntervals(
  geoPoints: GeoPoint[],
  activitySamples: RawActivitySample[],
): ClassifiedInterval[] {
  if (geoPoints.length < 2) return [];

  const sortedActivity = [...activitySamples].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  // Find the closest activity sample within ±5 s of a given time
  function nearestActivity(t: Date): RawActivitySample | null {
    let best: RawActivitySample | null = null;
    let bestDt = 5000;
    for (const a of sortedActivity) {
      const dt = Math.abs(a.timestamp.getTime() - t.getTime());
      if (dt < bestDt) { bestDt = dt; best = a; }
      if (a.timestamp.getTime() > t.getTime() + 5000) break;
    }
    return best;
  }

  const dwellIntervalIndexes = detectDwellIntervals(geoPoints);
  const evidenceIntervals: Array<ClassifiedInterval & {
    bikeEvidence: number;
    driveEvidence: number;
  }> = [];

  for (let i = 0; i < geoPoints.length - 1; i++) {
    const p = geoPoints[i];
    const next = geoPoints[i + 1];
    const intervalDurationMs = next.timestamp.getTime() - p.timestamp.getTime();
    if (intervalDurationMs <= 0 || intervalDurationMs > V1.maxContinuousIntervalMs) {
      continue;
    }

    const actSample = nearestActivity(p.timestamp);
    const activityEvidence = actSample ? bestActivityEvidence(actSample) : null;
    const fromActivity = activityEvidence?.type ?? null;
    const speedMps = intervalSpeedMps(p, next);
    const hasMovingSignal =
      isMovingActivity(fromActivity) &&
      speedMps !== undefined &&
      speedMps > V1.stationaryMaxMps;
    const type =
      dwellIntervalIndexes.has(i) && !hasMovingSignal
        ? 'STATIONARY'
        : reconcileActivityWithSpeed(fromActivity, speedMps);

    evidenceIntervals.push({
      startTime: p.timestamp,
      endTime: next.timestamp,
      type,
      bikeEvidence: activityEvidence?.type === 'BIKE' ? activityEvidence.confidence : 0,
      driveEvidence:
        (activityEvidence?.type === 'DRIVE' ? activityEvidence.confidence : 0) +
        (speedMps !== undefined && speedMps >= V1.motionBikeHardMaxMps ? 100 : 0),
    });
  }

  return mergeClassifiedIntervals(resolveProvisionalBikeDrive(evidenceIntervals));
}

function resolveProvisionalBikeDrive<T extends ClassifiedInterval & {
  bikeEvidence: number;
  driveEvidence: number;
}>(intervals: T[]): ClassifiedInterval[] {
  const resolved = intervals.map((interval) => ({ ...interval }));
  let start = 0;

  while (start < resolved.length) {
    if (resolved[start].type !== 'BIKE' && resolved[start].type !== 'DRIVE') {
      start += 1;
      continue;
    }

    let end = start + 1;
    while (
      end < resolved.length &&
      (resolved[end].type === 'BIKE' || resolved[end].type === 'DRIVE') &&
      resolved[end].startTime.getTime() - resolved[end - 1].endTime.getTime() <=
        V1.mergeGapThresholdMs
    ) {
      end += 1;
    }

    const run = resolved.slice(start, end);
    const bikeEvidence = run.reduce((sum, interval) => sum + interval.bikeEvidence, 0);
    const driveEvidence = run.reduce((sum, interval) => sum + interval.driveEvidence, 0);

    // BIKE/DRIVE is provisional until the complete uninterrupted movement run
    // has been observed. This allows a stronger later signal to correct an
    // initial false positive without inventing a mode switch that never occurred.
    if (bikeEvidence > 0 || driveEvidence > 0) {
      const resolvedType = driveEvidence > bikeEvidence ? 'DRIVE' : 'BIKE';
      for (let index = start; index < end; index += 1) {
        resolved[index].type = resolvedType;
      }
    }

    start = end;
  }

  return resolved.map(({ startTime, endTime, type }) => ({ startTime, endTime, type }));
}

function mergeClassifiedIntervals(intervals: ClassifiedInterval[]): ClassifiedInterval[] {
  const merged: ClassifiedInterval[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.type === interval.type &&
      last.endTime.getTime() >= interval.startTime.getTime()
    ) {
      last.endTime = interval.endTime;
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}
