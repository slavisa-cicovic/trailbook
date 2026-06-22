import type { SegmentType } from "../model";
import type { SegmenterConfig } from "./segmenter-config";

const IN_VEHICLE = 0;
const ON_BICYCLE = 1;
const ON_FOOT = 2;
const STILL = 3;
const WALKING = 7;
const RUNNING = 8;

export function classifyActivity(
  activityType: number,
  speedMps: number | null,
  config: SegmenterConfig,
): SegmentType {
  switch (activityType) {
    case IN_VEHICLE:
      return speedMps !== null && speedMps > config.planeSpeedThresholdMps ? "plane" : "drive";
    case ON_BICYCLE:
      return "bike";
    case ON_FOOT:
    case WALKING:
    case RUNNING:
      return "walk";
    case STILL:
      return "stationary";
    default:
      return classifyFromSpeed(speedMps, config);
  }
}

export function classifyFromSpeed(speedMps: number | null, config: SegmenterConfig): SegmentType {
  if (speedMps === null) {
    return "unknown";
  }

  if (speedMps > config.planeSpeedThresholdMps) {
    return "plane";
  }

  if (speedMps >= config.driveMinSpeedMps) {
    return "drive";
  }

  if (speedMps >= config.stationaryMaxSpeedMps) {
    return "walk";
  }

  return "stationary";
}
