import type { RecordingProfile, RecordingSessionSummary, Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import type { MotionActivity } from "../../domain/motion-activity";
import {
  closeActiveTripSegment,
  getOpenTripSegmentForTrip,
  normalizeAutoClosedTripSegment,
  startNextTripSegment,
} from "../trip-segments/trip-segments.service";
import { getVisibleTripPointsForTrip } from "../trip-points/trip-points.service";
import { updateRecordingAutoCandidate, updateRecordingSegment } from "./recording.service";

interface AutoRecordingTransitionResult {
  changed: boolean;
  session: RecordingSessionSummary;
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
}

interface TimedSpeedSample {
  moving: boolean;
  recordedAtMs: number;
  speedKmh: number;
}

export interface AutoLocationPoint {
  accuracy: number | null;
  latitude: number;
  longitude: number;
  recordedAt: string;
  speed: number | null;
}

const WALK_MAX_KMH = 6;
const BIKE_MIN_KMH = 8.5;
const BIKE_MAX_KMH = 35;
const DRIVE_MIN_KMH = 28;
const PLANE_MIN_KMH = 180;
const PLANE_PEAK_KMH = 250;
const BOAT_MIN_KMH = 12;
const BOAT_MAX_KMH = 35;
const STATIONARY_MAX_KMH = 2;
const AUTO_RAW_SAMPLE_MAX_AGE_MS = 15 * 60 * 1000;
const AUTO_RAW_SAMPLE_MAX_COUNT = 240;

const WALK_STABILITY_MS = 60_000;
// Short inference window for current-activity detection so stale samples
// from a preceding different-mode segment don't suppress the new mode.
// Both walk and drive use this window so drive→walk and walk→drive
// transitions react to the last 2 min, not the last 10 min.
const ACTIVITY_INFERENCE_WINDOW_MS = 2 * 60 * 1000;
const BIKE_STABILITY_MS = 75 * 1000;
const MOTION_ASSISTED_BIKE_STABILITY_MS = 45 * 1000;
const DRIVE_STABILITY_MS = 75 * 1000;
const MOTION_ASSISTED_DRIVE_STABILITY_MS = 45 * 1000;
const PLANE_STABILITY_MS = 3 * 60 * 1000;
const BOAT_STABILITY_MS = 20 * 60 * 1000;
const MOTION_ACTIVITY_MAX_AGE_MS = 10 * 60 * 1000;
const rawAutoSamplesByTripLocalId = new Map<string, AutoLocationPoint[]>();

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMetersBetweenPoints(left: AutoLocationPoint, right: AutoLocationPoint): number {
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

function normalizeHeadingDegrees(value: number): number {
  if (value < 0) {
    return value + 360;
  }

  if (value >= 360) {
    return value - 360;
  }

  return value;
}

function headingDegreesBetweenPoints(left: AutoLocationPoint, right: AutoLocationPoint): number {
  const latitudeLeft = toRadians(left.latitude);
  const latitudeRight = toRadians(right.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);

  const y = Math.sin(deltaLongitude) * Math.cos(latitudeRight);
  const x =
    Math.cos(latitudeLeft) * Math.sin(latitudeRight) -
    Math.sin(latitudeLeft) * Math.cos(latitudeRight) * Math.cos(deltaLongitude);

  return normalizeHeadingDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function headingDeltaDegrees(left: number, right: number): number {
  const delta = Math.abs(left - right);
  return Math.min(delta, 360 - delta);
}

function median(values: number[]): number {
  const ordered = [...values].sort((left, right) => left - right);

  if (ordered.length === 0) {
    return 0;
  }

  const middleIndex = Math.floor(ordered.length / 2);

  if (ordered.length % 2 === 1) {
    return ordered[middleIndex];
  }

  return (ordered[middleIndex - 1] + ordered[middleIndex]) / 2;
}

function getPointTimeMs(point: AutoLocationPoint): number {
  return new Date(point.recordedAt).getTime();
}

function getSpeedKmh(previousPoint: AutoLocationPoint | null, point: AutoLocationPoint): number | null {
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

function isMotionAssistedBikeCandidate(motionActivity: MotionActivity | null): boolean {
  return (
    motionActivity?.type === "bike" &&
    (motionActivity.confidence === "medium" || motionActivity.confidence === "high")
  );
}

function isMotionAssistedDriveCandidate(motionActivity: MotionActivity | null): boolean {
  return (
    motionActivity?.type === "drive" &&
    (motionActivity.confidence === "medium" || motionActivity.confidence === "high")
  );
}

export function recordAutoRecordingSample(
  tripLocalId: string,
  snapshot: AutoLocationPoint,
): AutoLocationPoint[] {
  const recordedAtMs = new Date(snapshot.recordedAt).getTime();

  if (Number.isNaN(recordedAtMs)) {
    return rawAutoSamplesByTripLocalId.get(tripLocalId) ?? [];
  }

  const existingSamples = rawAutoSamplesByTripLocalId.get(tripLocalId) ?? [];
  const deduplicatedSamples = existingSamples.filter((sample) => sample.recordedAt !== snapshot.recordedAt);
  const minRecordedAtMs = recordedAtMs - AUTO_RAW_SAMPLE_MAX_AGE_MS;
  const nextSamples = [...deduplicatedSamples, snapshot]
    .filter((sample) => new Date(sample.recordedAt).getTime() >= minRecordedAtMs)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .slice(-AUTO_RAW_SAMPLE_MAX_COUNT);

  rawAutoSamplesByTripLocalId.set(tripLocalId, nextSamples);
  return nextSamples;
}

export function clearAutoRecordingSamples(tripLocalId: string) {
  rawAutoSamplesByTripLocalId.delete(tripLocalId);
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

function getAutoStabilityThresholdMs(recordingProfile: RecordingProfile): number {
  switch (recordingProfile) {
    case "walk":
      return WALK_STABILITY_MS;
    case "bike":
      return BIKE_STABILITY_MS;
    case "drive":
      return DRIVE_STABILITY_MS;
    case "boat":
      return BOAT_STABILITY_MS;
    case "plane":
      return PLANE_STABILITY_MS;
    default:
      return DRIVE_STABILITY_MS;
  }
}

function getAutoTransitionStabilityThresholdMs(
  recordingProfile: RecordingProfile,
  motionActivity: MotionActivity | null,
): number {
  if (recordingProfile === "bike" && isMotionAssistedBikeCandidate(motionActivity)) {
    return MOTION_ASSISTED_BIKE_STABILITY_MS;
  }

  if (recordingProfile === "drive" && isMotionAssistedDriveCandidate(motionActivity)) {
    return MOTION_ASSISTED_DRIVE_STABILITY_MS;
  }

  return getAutoStabilityThresholdMs(recordingProfile);
}

export function applyAutoRecordingTransition(
  recordingSession: RecordingSessionSummary,
  trip: Trip,
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  waypoints: Waypoint[],
  recordedAt: string,
  motionActivity: MotionActivity | null = null,
  rawTripPoints: AutoLocationPoint[] | null = null,
): AutoRecordingTransitionResult {
  if (recordingSession.recordingMode !== "auto" || !recordingSession.activeSegmentId) {
    return {
      changed: false,
      session: recordingSession,
      tripSegments,
      waypoints,
    };
  }

  const acceptedTripPoints = getVisibleTripPointsForTrip(tripPoints, trip.localId);
  const inferredProfile = inferAutoRecordingProfile(
    rawTripPoints && rawTripPoints.length > 0 ? rawTripPoints : acceptedTripPoints,
    motionActivity,
  );
  const activeSegment =
    tripSegments.find((segment) => segment.localId === recordingSession.activeSegmentId) ??
    getOpenTripSegmentForTrip(tripSegments, trip.localId);
  const currentProfile = activeSegment?.recordingProfile ?? recordingSession.recordingProfile;
  const keepExistingCandidate =
    recordingSession.autoCandidateProfile !== null &&
    recordingSession.autoCandidateProfile !== currentProfile;

  if (!activeSegment) {
    return {
      changed: false,
      session: recordingSession,
      tripSegments,
      waypoints,
    };
  }

  if (inferredProfile === null || inferredProfile === currentProfile) {
    return {
      changed: false,
      session: keepExistingCandidate
        ? recordingSession
        : recordingSession.autoCandidateProfile === null && recordingSession.autoCandidateSince === null
          ? recordingSession
          : updateRecordingAutoCandidate(recordingSession, null, null),
      tripSegments,
      waypoints,
    };
  }

  if (recordingSession.autoCandidateProfile !== inferredProfile) {
    return {
      changed: false,
      session: updateRecordingAutoCandidate(recordingSession, inferredProfile, recordedAt),
      tripSegments,
      waypoints,
    };
  }

  const candidateSinceMs = recordingSession.autoCandidateSince
    ? new Date(recordingSession.autoCandidateSince).getTime()
    : Number.NaN;
  const recordedAtMs = new Date(recordedAt).getTime();

  if (
    Number.isNaN(candidateSinceMs) ||
    Number.isNaN(recordedAtMs) ||
    recordedAtMs - candidateSinceMs < getAutoTransitionStabilityThresholdMs(inferredProfile, motionActivity)
  ) {
    return {
      changed: false,
      session: recordingSession,
      tripSegments,
      waypoints,
    };
  }

  const closedSegments = closeActiveTripSegment(tripSegments, activeSegment.localId, recordedAt);
  const { nextSegment, tripSegments: stagedTripSegments } = startNextTripSegment(
    trip,
    closedSegments,
    inferredProfile,
    recordedAt,
  );
  const normalizedState = normalizeAutoClosedTripSegment(
    stagedTripSegments,
    tripPoints,
    waypoints,
    trip.localId,
    recordedAt,
  );

  return {
    changed: true,
    session: updateRecordingSegment(recordingSession, nextSegment.localId, inferredProfile),
    tripSegments: normalizedState.tripSegments,
    waypoints: normalizedState.waypoints,
  };
}

export function applyBatchAutoTransitionIfNeeded(
  recordingSession: RecordingSessionSummary,
  trip: Trip,
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  waypoints: Waypoint[],
  batchSamples: AutoLocationPoint[],
  motionActivity: MotionActivity | null = null,
): AutoRecordingTransitionResult {
  if (
    recordingSession.recordingMode !== "auto" ||
    batchSamples.length < 2 ||
    !recordingSession.activeSegmentId
  ) {
    return { changed: false, session: recordingSession, tripSegments, waypoints };
  }

  const sortedSamples = [...batchSamples].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const firstRecordedAt = sortedSamples[0]?.recordedAt;
  const lastRecordedAt = sortedSamples[sortedSamples.length - 1]?.recordedAt;

  if (!firstRecordedAt || !lastRecordedAt) {
    return { changed: false, session: recordingSession, tripSegments, waypoints };
  }

  const firstMs = new Date(firstRecordedAt).getTime();
  const lastMs = new Date(lastRecordedAt).getTime();

  if (Number.isNaN(firstMs) || Number.isNaN(lastMs)) {
    return { changed: false, session: recordingSession, tripSegments, waypoints };
  }

  const batchSpanMs = lastMs - firstMs;
  const inferredProfile = inferAutoRecordingProfile(sortedSamples, motionActivity);

  const activeSegment =
    tripSegments.find((segment) => segment.localId === recordingSession.activeSegmentId) ??
    getOpenTripSegmentForTrip(tripSegments, trip.localId);
  const currentProfile = activeSegment?.recordingProfile ?? recordingSession.recordingProfile;

  if (!inferredProfile || inferredProfile === currentProfile || !activeSegment) {
    return { changed: false, session: recordingSession, tripSegments, waypoints };
  }

  if (batchSpanMs < getAutoStabilityThresholdMs(inferredProfile)) {
    return { changed: false, session: recordingSession, tripSegments, waypoints };
  }

  // Clamp transition time: GPS timestamps can precede the segment start by a
  // few milliseconds (cached fix), which would produce a negative-duration segment.
  const segmentStartMs = new Date(activeSegment.startedAt).getTime();
  const transitionAt = Number.isFinite(segmentStartMs) && firstMs < segmentStartMs
    ? activeSegment.startedAt
    : firstRecordedAt;

  const closedSegments = closeActiveTripSegment(tripSegments, activeSegment.localId, transitionAt);
  const { nextSegment, tripSegments: stagedTripSegments } = startNextTripSegment(
    trip,
    closedSegments,
    inferredProfile,
    transitionAt,
  );
  const normalizedState = normalizeAutoClosedTripSegment(
    stagedTripSegments,
    tripPoints,
    waypoints,
    trip.localId,
    transitionAt,
  );

  return {
    changed: true,
    session: updateRecordingSegment(recordingSession, nextSegment.localId, inferredProfile),
    tripSegments: normalizedState.tripSegments,
    waypoints: normalizedState.waypoints,
  };
}
