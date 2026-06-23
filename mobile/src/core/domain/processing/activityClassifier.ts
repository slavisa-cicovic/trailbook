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
  if (speedMps === undefined) return 'UNKNOWN';
  if (speedMps < V1.stationaryMaxMps) return 'STATIONARY';
  if (speedMps < V1.walkMaxMps)       return 'WALK';
  if (speedMps < V1.bikeMaxMps)       return 'BIKE';
  if (speedMps < V1.driveMaxMps)      return 'DRIVE';
  return 'DRIVE'; // > 50 m/s: PLANE heuristic future
}

function bestActivityType(sample: RawActivitySample): SegmentType | null {
  if (!sample.results.length) return null;
  const best = sample.results.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
  if (best.confidence < 50) return null;
  return activityTypeToSegmentType(best.activityType);
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

  const intervals: ClassifiedInterval[] = [];

  for (let i = 0; i < geoPoints.length - 1; i++) {
    const p = geoPoints[i];
    const next = geoPoints[i + 1];

    const actSample = nearestActivity(p.timestamp);
    let type: SegmentType;

    if (actSample) {
      const fromActivity = bestActivityType(actSample);
      type = fromActivity ?? speedToSegmentType(p.speedMps);
    } else {
      type = speedToSegmentType(p.speedMps);
    }

    // Merge with previous interval if same type
    const last = intervals[intervals.length - 1];
    if (last && last.type === type && last.endTime.getTime() >= p.timestamp.getTime()) {
      last.endTime = next.timestamp;
    } else {
      intervals.push({ startTime: p.timestamp, endTime: next.timestamp, type });
    }
  }

  return intervals;
}
