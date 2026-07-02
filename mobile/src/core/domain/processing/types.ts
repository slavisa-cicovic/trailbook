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
  maxAccuracyM: 25,
  speedSpikeThresholdMps: 120,  // 432 km/h - above any realistic ground transport
  maxContinuousIntervalMs: 60_000,
  routeGapSplitThresholdMs: 60_000,
  routeGapSplitMinDistanceM: 100,
  stationaryMaxMps: 0.5,
  walkMaxMps: 2.5,
  bikeMaxMps: 7.0,
  hardDriveMinMps: 8.5,
  driveMaxMps: 50.0,
  minWalkDurationMs: 60_000,
  minDriveDurationMs: 10_000,
  minBikeDurationMs: 30_000,
  minStationaryDurationMs: 30_000,
  dwellStationaryMinDurationMs: 60_000,
  dwellStationaryRadiusM: 30,
  stationaryGapMinDurationMs: 120_000,
  stationaryGapMaxDistanceM: 50,
  gapSplitThresholdMs: 60_000,
  mergeGapThresholdMs: 30_000,
  driveInterruptionMaxMs: 5 * 60_000,
  walkStationaryInterruptionMaxMs: 4 * 60_000,
  walkStationaryInterruptionMinDistanceM: 15,
  bikeMinAverageMps: 2.5,
  // Absorb an isolated segment that is sandwiched between two same-type segments
  // and shorter than this threshold (handles traffic stops, brief slowdowns, etc.)
  isoSegmentAbsorbMaxMs: 3 * 60_000,
} as const;
