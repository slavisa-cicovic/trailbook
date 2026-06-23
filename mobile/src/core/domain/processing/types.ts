import type { SegmentType } from '../model/segment';

export interface GeoPoint {
  timestamp: Date;
  latitude: number;
  longitude: number;
  speedMps: number | undefined;
  altitudeM: number | undefined;
}

export interface ClassifiedInterval {
  startTime: Date;
  endTime: Date;
  type: SegmentType;
}

// Pipeline tuning constants (v1)
export const V1 = {
  maxAccuracyM: 50,
  speedSpikeThresholdMs: 33.3,  // 120 km/h
  speedSpikeWindowMs: 2000,
  stationaryMaxMps: 0.5,
  walkMaxMps: 2.5,
  bikeMaxMps: 7.0,
  driveMaxMps: 50.0,
  minWalkDurationMs: 60_000,
  minDriveDurationMs: 30_000,
  minBikeDurationMs: 30_000,
  minStationaryDurationMs: 30_000,
  gapSplitThresholdMs: 5 * 60_000,
  mergeGapThresholdMs: 30_000,
} as const;
