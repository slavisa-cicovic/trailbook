export interface SegmenterConfig {
  driveMinSpeedMps: number;
  maxAccuracyForDistanceM: number;
  maxActivityGapS: number;
  minSegmentDurationS: number;
  planeSpeedThresholdMps: number;
  smoothingWindowHalf: number;
  stationaryMaxSpeedMps: number;
}

export const PROCESSING_VERSION = 1;

export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
  driveMinSpeedMps: 4,
  maxAccuracyForDistanceM: 50,
  maxActivityGapS: 90,
  minSegmentDurationS: 60,
  planeSpeedThresholdMps: 83.3,
  smoothingWindowHalf: 2,
  stationaryMaxSpeedMps: 0.5,
};
