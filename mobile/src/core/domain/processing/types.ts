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
  // A motion-confirmed bicycle can legitimately exceed the speed-only bike
  // threshold (for example on a descent). Above this value, treat the motion
  // hint as implausible and prefer DRIVE.
  motionBikeHardMaxMps: 20.0,
  hardDriveMinMps: 8.5,
  driveMaxMps: 50.0,
  minWalkDurationMs: 60_000,
  minDriveDurationMs: 10_000,
  minBikeDurationMs: 30_000,
  // Changing between bicycle and vehicle implies stopping to enter/leave the
  // vehicle. Keep a 20-second stop so it can serve as a mode-change boundary.
  minStationaryDurationMs: 20_000,
  bikeDriveTransitionStopMinMs: 20_000,
  stationarySegmentMaxDistanceM: 20,
  dwellStationaryMinDurationMs: 60_000,
  dwellStationaryRadiusM: 30,
  stationaryGapMinDurationMs: 120_000,
  stationaryGapMaxDistanceM: 50,
  gapSplitThresholdMs: 60_000,
  mergeGapThresholdMs: 30_000,
  driveInterruptionMaxMs: 5 * 60_000,
  driveAdjacentBikeMaxMs: 2 * 60_000,
  bikeDriveBridgeMaxMs: 15 * 60_000,
  bikeDriveBoundaryWindowMs: 30_000,
  // After DRIVE is established, noisy BIKE/WALK evidence is not a reliable mode
  // switch. One alternative must both outweigh the other by this ratio and last
  // for that mode's ordinary minimum duration.
  alternativeModeEvidenceDominanceRatio: 2,
  walkStationaryInterruptionMaxMs: 4 * 60_000,
  walkStationaryInterruptionMinDistanceM: 15,
  walkSparseMergeMaxMs: 10 * 60_000,
  walkSparseMergeMaxDistanceM: 300,
  bikeMinAverageMps: 2.5,
  // Absorb an isolated segment that is sandwiched between two same-type segments
  // and shorter than this threshold (handles traffic stops, brief slowdowns, etc.)
  isoSegmentAbsorbMaxMs: 3 * 60_000,
} as const;
