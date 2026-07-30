import type { RawActivitySample } from '@/core/domain/model/rawSamples';
import { V1 } from '@/core/domain/processing/types';

// Android activity type constants (same wire values as android app)
const ACTIVITY_UNKNOWN = 4;
const ACTIVITY_STILL = 3;
const ACTIVITY_ON_FOOT = 2;
const ACTIVITY_ON_BICYCLE = 1;
const ACTIVITY_IN_VEHICLE = 0;

// Speed thresholds (m/s)
const SPEED_STILL = 0.3;
const SPEED_FOOT = 1.5;

export function buildActivitySampleFromSpeed(tripId: string, speedMps: number | null | undefined, timestamp: Date): RawActivitySample {
  let activityType: number;
  let confidence: number;

  if (speedMps === null || speedMps === undefined || speedMps < 0) {
    activityType = ACTIVITY_UNKNOWN;
    confidence = 50;
  } else if (speedMps < SPEED_STILL) {
    activityType = ACTIVITY_STILL;
    confidence = 90;
  } else if (speedMps < SPEED_FOOT) {
    activityType = ACTIVITY_ON_FOOT;
    confidence = 75;
  } else if (speedMps < V1.bikeMaxMps) {
    activityType = ACTIVITY_ON_BICYCLE;
    confidence = 60;
  } else {
    activityType = ACTIVITY_IN_VEHICLE;
    confidence = 70;
  }

  return {
    tripId,
    timestamp,
    results: [{ activityType, confidence }],
  };
}
