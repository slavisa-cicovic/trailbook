import type { RecordingProfile, RecordingSessionSummary, Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import type { MotionActivity } from "../../domain/motion-activity";
import {
  BIKE_STABILITY_MS,
  BOAT_STABILITY_MS,
  DRIVE_STABILITY_MS,
  MOTION_ASSISTED_BIKE_STABILITY_MS,
  MOTION_ASSISTED_DRIVE_STABILITY_MS,
  PLANE_STABILITY_MS,
  WALK_STABILITY_MS,
  type AutoLocationPoint,
} from "./auto-recording.utils";
import {
  inferAutoRecordingProfile,
  isMotionAssistedBikeCandidate,
  isMotionAssistedDriveCandidate,
} from "./auto-recording-inference.service";
import {
  closeActiveTripSegment,
  getOpenTripSegmentForTrip,
  normalizeAutoClosedTripSegment,
  removeInitialAutoBootstrapWalkSegment,
  startNextTripSegment,
} from "../trip-segments/trip-segments.service";
import { getVisibleTripPointsForTrip } from "../trip-points/trip-points.service";
import { updateRecordingAutoCandidate, updateRecordingSegment } from "./recording.service";

export interface AutoRecordingTransitionResult {
  changed: boolean;
  session: RecordingSessionSummary;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
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
      tripPoints,
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
      tripPoints,
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
      tripPoints,
      tripSegments,
      waypoints,
    };
  }

  if (recordingSession.autoCandidateProfile !== inferredProfile) {
    return {
      changed: false,
      session: updateRecordingAutoCandidate(recordingSession, inferredProfile, recordedAt),
      tripPoints,
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
      tripPoints,
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
  const prunedState = removeInitialAutoBootstrapWalkSegment(
    normalizedState.tripSegments,
    normalizedState.tripPoints,
    normalizedState.waypoints,
    trip.localId,
    nextSegment.localId,
    recordedAt,
  );

  return {
    changed: true,
    session: updateRecordingSegment(recordingSession, nextSegment.localId, inferredProfile),
    tripPoints: prunedState.tripPoints,
    tripSegments: prunedState.tripSegments,
    waypoints: prunedState.waypoints,
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
    return { changed: false, session: recordingSession, tripPoints, tripSegments, waypoints };
  }

  const sortedSamples = [...batchSamples].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const firstRecordedAt = sortedSamples[0]?.recordedAt;
  const lastRecordedAt = sortedSamples[sortedSamples.length - 1]?.recordedAt;

  if (!firstRecordedAt || !lastRecordedAt) {
    return { changed: false, session: recordingSession, tripPoints, tripSegments, waypoints };
  }

  const firstMs = new Date(firstRecordedAt).getTime();
  const lastMs = new Date(lastRecordedAt).getTime();

  if (Number.isNaN(firstMs) || Number.isNaN(lastMs)) {
    return { changed: false, session: recordingSession, tripPoints, tripSegments, waypoints };
  }

  const batchSpanMs = lastMs - firstMs;
  const inferredProfile = inferAutoRecordingProfile(sortedSamples, motionActivity);

  const activeSegment =
    tripSegments.find((segment) => segment.localId === recordingSession.activeSegmentId) ??
    getOpenTripSegmentForTrip(tripSegments, trip.localId);
  const currentProfile = activeSegment?.recordingProfile ?? recordingSession.recordingProfile;

  if (!inferredProfile || inferredProfile === currentProfile || !activeSegment) {
    return { changed: false, session: recordingSession, tripPoints, tripSegments, waypoints };
  }

  if (batchSpanMs < getAutoStabilityThresholdMs(inferredProfile)) {
    return { changed: false, session: recordingSession, tripPoints, tripSegments, waypoints };
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
  const prunedState = removeInitialAutoBootstrapWalkSegment(
    normalizedState.tripSegments,
    normalizedState.tripPoints,
    normalizedState.waypoints,
    trip.localId,
    nextSegment.localId,
    transitionAt,
  );

  return {
    changed: true,
    session: updateRecordingSegment(recordingSession, nextSegment.localId, inferredProfile),
    tripPoints: prunedState.tripPoints,
    tripSegments: prunedState.tripSegments,
    waypoints: prunedState.waypoints,
  };
}
