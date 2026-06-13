// Speed classification thresholds (km/h)
export const WALK_MAX_KMH = 6;
export const BIKE_MIN_KMH = 8.5;
export const BIKE_MAX_KMH = 35;
export const DRIVE_MIN_KMH = 28;
export const PLANE_MIN_KMH = 180;
export const PLANE_PEAK_KMH = 250;
export const BOAT_MIN_KMH = 12;
export const BOAT_MAX_KMH = 35;
export const STATIONARY_MAX_KMH = 2;
export const STATIONARY_STABILITY_MS = 2 * 60 * 1000;
export const STATIONARY_MAX_DISPLACEMENT_METERS = 35;
export const STATIONARY_MAX_TRAVEL_DISTANCE_METERS = 60;

// Stability windows (ms)
export const WALK_STABILITY_MS = 60_000;
// Short inference window for current-activity detection so stale samples
// from a preceding different-mode segment don't suppress the new mode.
// Both walk and drive use this window so drive→walk and walk→drive
// transitions react to the last 2 min, not the last 10 min.
export const ACTIVITY_INFERENCE_WINDOW_MS = 2 * 60 * 1000;
export const BIKE_STABILITY_MS = 75 * 1000;
export const MOTION_ASSISTED_BIKE_STABILITY_MS = 45 * 1000;
export const DRIVE_STABILITY_MS = 60 * 1000;
export const MOTION_ASSISTED_DRIVE_STABILITY_MS = 45 * 1000;
export const PLANE_STABILITY_MS = 3 * 60 * 1000;
export const BOAT_STABILITY_MS = 20 * 60 * 1000;
export const MOTION_ACTIVITY_MAX_AGE_MS = 10 * 60 * 1000;

// Batch timing
export const AUTO_BATCH_MIN_WALK_RUN_MS = 30 * 1000;
export const AUTO_BATCH_MIN_BIKE_RUN_MS = 45 * 1000;
export const AUTO_BATCH_MIN_DRIVE_RUN_MS = 60 * 1000;

export interface AutoLocationPoint {
  accuracy: number | null;
  latitude: number;
  longitude: number;
  recordedAt: string;
  speed: number | null;
}

export function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function distanceMetersBetweenPoints(left: AutoLocationPoint, right: AutoLocationPoint): number {
  const earthRadiusMeters = 6371000;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const latitudeLeft = toRadians(left.latitude);
  const latitudeRight = toRadians(right.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(latitudeLeft) *
      Math.cos(latitudeRight) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMeters * arc;
}

export function normalizeHeadingDegrees(value: number): number {
  if (value < 0) {
    return value + 360;
  }

  if (value >= 360) {
    return value - 360;
  }

  return value;
}

export function headingDegreesBetweenPoints(left: AutoLocationPoint, right: AutoLocationPoint): number {
  const latitudeLeft = toRadians(left.latitude);
  const latitudeRight = toRadians(right.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);

  const y = Math.sin(deltaLongitude) * Math.cos(latitudeRight);
  const x =
    Math.cos(latitudeLeft) * Math.sin(latitudeRight) -
    Math.sin(latitudeLeft) * Math.cos(latitudeRight) * Math.cos(deltaLongitude);

  return normalizeHeadingDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

export function headingDeltaDegrees(left: number, right: number): number {
  const delta = Math.abs(left - right);
  return Math.min(delta, 360 - delta);
}

export function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);

  if (ordered.length === 0) {
    return 0;
  }

  const middleIndex = Math.floor(ordered.length / 2);

  if (ordered.length % 2 === 1) {
    return ordered[middleIndex] as number;
  }

  return ((ordered[middleIndex - 1] as number) + (ordered[middleIndex] as number)) / 2;
}

export function percentile(values: number[], percentileValue: number): number {
  const ordered = [...values].sort((left, right) => left - right);

  if (ordered.length === 0) {
    return 0;
  }

  const clampedPercentile = Math.min(1, Math.max(0, percentileValue));
  const index = Math.ceil(clampedPercentile * ordered.length) - 1;

  return ordered[Math.max(0, Math.min(index, ordered.length - 1))] as number;
}

export function getPointTimeMs(point: AutoLocationPoint): number {
  return new Date(point.recordedAt).getTime();
}

export function getSpeedKmh(previousPoint: AutoLocationPoint | null, point: AutoLocationPoint): number | null {
  if (point.speed !== null && Number.isFinite(point.speed) && point.speed >= 0) {
    return point.speed * 3.6;
  }

  if (!previousPoint) {
    return null;
  }

  const previousTimeMs = getPointTimeMs(previousPoint);
  const pointTimeMs = getPointTimeMs(point);
  const deltaSeconds = (pointTimeMs - previousTimeMs) / 1000;

  if (deltaSeconds <= 0) {
    return null;
  }

  return (distanceMetersBetweenPoints(previousPoint, point) / deltaSeconds) * 3.6;
}
