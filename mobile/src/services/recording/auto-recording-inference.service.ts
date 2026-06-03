import type { RecordingProfile } from "../../domain/trips";
import type { MotionActivity } from "../../domain/motion-activity";
import {
  ACTIVITY_INFERENCE_WINDOW_MS,
  BIKE_MAX_KMH,
  BIKE_MIN_KMH,
  BOAT_MAX_KMH,
  BOAT_MIN_KMH,
  BOAT_STABILITY_MS,
  DRIVE_MIN_KMH,
  MOTION_ACTIVITY_MAX_AGE_MS,
  PLANE_MIN_KMH,
  PLANE_PEAK_KMH,
  PLANE_STABILITY_MS,
  STATIONARY_MAX_KMH,
  WALK_MAX_KMH,
  type AutoLocationPoint,
  distanceMetersBetweenPoints,
  getPointTimeMs,
  getSpeedKmh,
  headingDegreesBetweenPoints,
  headingDeltaDegrees,
  median,
} from "./auto-recording.utils";

interface TimedSpeedSample {
  moving: boolean;
  recordedAtMs: number;
  speedKmh: number;
}

function buildTimedSpeedSamples(tripPoints: AutoLocationPoint[]): TimedSpeedSample[] {
  return tripPoints.reduce<TimedSpeedSample[]>((samples, point, index) => {
    const speedKmh = getSpeedKmh(index > 0 ? tripPoints[index - 1] ?? null : null, point);

    if (speedKmh === null || !Number.isFinite(speedKmh)) {
      return samples;
    }

    samples.push({
      moving: speedKmh > STATIONARY_MAX_KMH,
      recordedAtMs: getPointTimeMs(point),
      speedKmh,
    });

    return samples;
  }, []);
}

function getStableWindow(samples: TimedSpeedSample[], durationMs: number): TimedSpeedSample[] {
  if (samples.length === 0) {
    return [];
  }

  const lastRecordedAtMs = samples[samples.length - 1]?.recordedAtMs ?? 0;
  const threshold = lastRecordedAtMs - durationMs;

  return samples.filter((sample) => sample.recordedAtMs >= threshold);
}

function getMovingStableWindow(samples: TimedSpeedSample[], durationMs: number): TimedSpeedSample[] {
  return getStableWindow(samples, durationMs).filter((sample) => sample.moving);
}

function getWindowDurationMs(samples: TimedSpeedSample[]): number {
  if (samples.length < 2) {
    return 0;
  }

  return (samples[samples.length - 1]?.recordedAtMs ?? 0) - (samples[0]?.recordedAtMs ?? 0);
}

function getHeadingChangeAverage(tripPoints: AutoLocationPoint[]): number {
  if (tripPoints.length < 3) {
    return Number.POSITIVE_INFINITY;
  }

  const headings: number[] = [];

  for (let index = 1; index < tripPoints.length; index += 1) {
    headings.push(headingDegreesBetweenPoints(tripPoints[index - 1], tripPoints[index]));
  }

  if (headings.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  let totalDelta = 0;

  for (let index = 1; index < headings.length; index += 1) {
    totalDelta += headingDeltaDegrees(headings[index - 1], headings[index]);
  }

  return totalDelta / (headings.length - 1);
}

function inferBoatFromTripPoints(tripPoints: AutoLocationPoint[]): boolean {
  if (tripPoints.length < 6) {
    return false;
  }

  const speedSamples = buildTimedSpeedSamples(tripPoints);
  const boatWindow = getMovingStableWindow(speedSamples, 30 * 60 * 1000);
  const boatTripPoints = tripPoints.filter(
    (point) =>
      getPointTimeMs(point) >=
      ((boatWindow[0]?.recordedAtMs ?? Number.POSITIVE_INFINITY) || Number.POSITIVE_INFINITY),
  );

  if (boatWindow.length < 6 || getWindowDurationMs(boatWindow) < BOAT_STABILITY_MS) {
    return false;
  }

  const medianSpeed = median(boatWindow.map((sample) => sample.speedKmh));
  const maxSpeed = Math.max(...boatWindow.map((sample) => sample.speedKmh));
  const headingChangeAverage = getHeadingChangeAverage(boatTripPoints);
  const totalDistanceMeters = boatTripPoints.reduce((distance, point, index) => {
    if (index === 0) {
      return distance;
    }

    return distance + distanceMetersBetweenPoints(boatTripPoints[index - 1], point);
  }, 0);

  return (
    medianSpeed >= BOAT_MIN_KMH &&
    medianSpeed <= BOAT_MAX_KMH &&
    maxSpeed < 55 &&
    totalDistanceMeters >= 15000 &&
    headingChangeAverage <= 12
  );
}

function inferLocationOnlyAutoRecordingProfile(tripPoints: AutoLocationPoint[]): RecordingProfile | null {
  const visibleTripPoints = [...tripPoints].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const speedSamples = buildTimedSpeedSamples(visibleTripPoints);

  if (speedSamples.length < 3) {
    return null;
  }

  const walkWindow = getMovingStableWindow(speedSamples, ACTIVITY_INFERENCE_WINDOW_MS);
  const bikeWindow = getMovingStableWindow(speedSamples, ACTIVITY_INFERENCE_WINDOW_MS);
  const driveWindow = getMovingStableWindow(speedSamples, ACTIVITY_INFERENCE_WINDOW_MS);
  const planeWindow = getMovingStableWindow(speedSamples, 6 * 60 * 1000);

  // This returns a candidate. applyAutoRecordingTransition owns the stability timer,
  // otherwise a profile switch needs two full stability windows and reacts too late.
  if (planeWindow.length >= 3) {
    const planeMedian = median(planeWindow.map((sample) => sample.speedKmh));
    const planeMax = Math.max(...planeWindow.map((sample) => sample.speedKmh));

    if (getWindowDurationMs(planeWindow) >= PLANE_STABILITY_MS && (planeMedian >= PLANE_MIN_KMH || planeMax >= PLANE_PEAK_KMH)) {
      return "plane";
    }
  }

  if (inferBoatFromTripPoints(visibleTripPoints)) {
    return "boat";
  }

  if (driveWindow.length >= 4) {
    const driveMedian = median(driveWindow.map((sample) => sample.speedKmh));

    if (driveMedian >= DRIVE_MIN_KMH) {
      return "drive";
    }
  }

  if (bikeWindow.length >= 4) {
    const bikeMedian = median(bikeWindow.map((sample) => sample.speedKmh));

    if (
      bikeMedian >= BIKE_MIN_KMH &&
      bikeMedian <= BIKE_MAX_KMH
    ) {
      return "bike";
    }
  }

  if (walkWindow.length >= 4) {
    const walkMedian = median(walkWindow.map((sample) => sample.speedKmh));

    if (walkMedian <= WALK_MAX_KMH) {
      return "walk";
    }
  }

  return null;
}

function isFreshMotionActivity(
  motionActivity: MotionActivity | null,
  tripPoints: AutoLocationPoint[],
): motionActivity is MotionActivity {
  if (!motionActivity) {
    return false;
  }

  const latestTripPoint = tripPoints[tripPoints.length - 1] ?? null;

  if (!latestTripPoint) {
    return false;
  }

  const latestPointMs = getPointTimeMs(latestTripPoint);
  const motionRecordedAtMs = new Date(motionActivity.recordedAt).getTime();

  if (Number.isNaN(latestPointMs) || Number.isNaN(motionRecordedAtMs)) {
    return false;
  }

  return latestPointMs - motionRecordedAtMs <= MOTION_ACTIVITY_MAX_AGE_MS;
}

function inferMotionGuidedProfile(
  tripPoints: AutoLocationPoint[],
  motionActivity: MotionActivity | null,
): RecordingProfile | null {
  const visibleTripPoints = [...tripPoints].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const speedSamples = buildTimedSpeedSamples(visibleTripPoints);
  const movingSamples = speedSamples.filter((sample) => sample.moving);

  if (!isFreshMotionActivity(motionActivity, visibleTripPoints)) {
    return null;
  }

  const movingMedian = movingSamples.length > 0 ? median(movingSamples.map((sample) => sample.speedKmh)) : 0;
  const maxSpeed = speedSamples.length > 0 ? Math.max(...speedSamples.map((sample) => sample.speedKmh)) : 0;

  switch (motionActivity.type) {
    case "drive":
      if (motionActivity.confidence === "high" || movingMedian >= 8 || maxSpeed >= 14) {
        return "drive";
      }
      return null;
    case "bike":
      if (motionActivity.confidence !== "low" || movingMedian >= 7 || maxSpeed >= 10) {
        return "bike";
      }
      return null;
    case "walk":
      if (maxSpeed < 12 && movingMedian <= (motionActivity.confidence === "low" ? WALK_MAX_KMH : 8)) {
        return "walk";
      }
      return null;
    default:
      return null;
  }
}

export function isMotionAssistedBikeCandidate(motionActivity: MotionActivity | null): boolean {
  return (
    motionActivity?.type === "bike" &&
    (motionActivity.confidence === "medium" || motionActivity.confidence === "high")
  );
}

export function isMotionAssistedDriveCandidate(motionActivity: MotionActivity | null): boolean {
  return (
    motionActivity?.type === "drive" &&
    (motionActivity.confidence === "medium" || motionActivity.confidence === "high")
  );
}

export function inferAutoRecordingProfile(
  tripPoints: AutoLocationPoint[],
  motionActivity: MotionActivity | null = null,
): RecordingProfile | null {
  const locationProfile = inferLocationOnlyAutoRecordingProfile(tripPoints);

  if (locationProfile === "plane" || locationProfile === "boat") {
    return locationProfile;
  }

  const motionProfile = inferMotionGuidedProfile(tripPoints, motionActivity);

  if (motionProfile === null) {
    return locationProfile;
  }

  if (locationProfile === null || locationProfile === motionProfile) {
    return motionProfile;
  }

  if (motionProfile === "drive") {
    return "drive";
  }

  if (motionProfile === "bike" && locationProfile === "walk") {
    return "bike";
  }

  return locationProfile;
}
