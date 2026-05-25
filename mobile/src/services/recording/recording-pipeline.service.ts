import * as Location from "expo-location";

import { restartBackgroundLocationTracking, toSnapshot, type CurrentLocationSnapshot } from "../location/location.service";
import { getLatestMotionActivityAsync } from "../motion/motion-activity.service";
import {
  appendTripPointIfUseful,
  createTripPointForLocation,
  recordLocationCallback,
  recordTripPointDiagnostic,
} from "../trip-points/trip-points.service";
import type { LocationCallbackSource } from "../trip-points/trip-point-diagnostics.service";
import { getOpenTripSegmentForTrip } from "../trip-segments/trip-segments.service";
import { setRecordingSession } from "../../state/recording-store";
import { setTripSegments } from "../../state/trip-segments-store";
import { mergeTripPoints } from "../../state/trip-points-store";
import { setWaypoints } from "../../state/waypoints-store";
import { loadRecordingSession } from "../../storage/recording-storage";
import { loadTripPointsForTrip } from "../../storage/trip-points-storage";
import { loadTripSegments } from "../../storage/trip-segments-storage";
import { loadTrips } from "../../storage/trips-storage";
import { loadWaypoints } from "../../storage/waypoints-storage";
import { applyAutoRecordingTransition, recordAutoRecordingSample } from "./auto-recording.service";
import { updateRecordingLastPoint, updateRecordingMotionActivity } from "./recording.service";

const AUTO_REJECTED_RECOVERY_MAX_AGE_MS = 10 * 60 * 1000;
const AUTO_REJECTED_RECOVERY_MAX_COUNT = 120;
const rejectedAutoSnapshotsByTripLocalId = new Map<string, CurrentLocationSnapshot[]>();
let recordingPipelineWriteQueue = Promise.resolve();

function getRejectedAutoRecoverySnapshots(tripLocalId: string, recordedAt: string): CurrentLocationSnapshot[] {
  const recordedAtMs = new Date(recordedAt).getTime();
  const minRecordedAtMs = Number.isNaN(recordedAtMs)
    ? Number.NEGATIVE_INFINITY
    : recordedAtMs - AUTO_REJECTED_RECOVERY_MAX_AGE_MS;

  return (rejectedAutoSnapshotsByTripLocalId.get(tripLocalId) ?? []).filter(
    (snapshot) => new Date(snapshot.recordedAt).getTime() >= minRecordedAtMs,
  );
}

function rememberRejectedAutoSnapshot(tripLocalId: string, snapshot: CurrentLocationSnapshot) {
  const recordedAtMs = new Date(snapshot.recordedAt).getTime();

  if (Number.isNaN(recordedAtMs)) {
    return;
  }

  const minRecordedAtMs = recordedAtMs - AUTO_REJECTED_RECOVERY_MAX_AGE_MS;
  const existingSnapshots = rejectedAutoSnapshotsByTripLocalId.get(tripLocalId) ?? [];
  const nextSnapshots = [...existingSnapshots.filter((candidate) => candidate.recordedAt !== snapshot.recordedAt), snapshot]
    .filter((candidate) => new Date(candidate.recordedAt).getTime() >= minRecordedAtMs)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .slice(-AUTO_REJECTED_RECOVERY_MAX_COUNT);

  rejectedAutoSnapshotsByTripLocalId.set(tripLocalId, nextSnapshots);
}

function forgetRejectedAutoSnapshots(tripLocalId: string, snapshots: CurrentLocationSnapshot[]) {
  if (snapshots.length === 0) {
    return;
  }

  const removedRecordedAt = new Set(snapshots.map((snapshot) => snapshot.recordedAt));
  const nextSnapshots = (rejectedAutoSnapshotsByTripLocalId.get(tripLocalId) ?? []).filter(
    (snapshot) => !removedRecordedAt.has(snapshot.recordedAt),
  );

  if (nextSnapshots.length === 0) {
    rejectedAutoSnapshotsByTripLocalId.delete(tripLocalId);
  } else {
    rejectedAutoSnapshotsByTripLocalId.set(tripLocalId, nextSnapshots);
  }
}

async function persistRecordedLocationSnapshots(
  snapshots: CurrentLocationSnapshot[],
  callbackSource: LocationCallbackSource,
): Promise<void> {
  const recordingSession = await loadRecordingSession();

  if (
    !recordingSession ||
    recordingSession.status !== "recording" ||
    !recordingSession.activeTripId
  ) {
    return;
  }

  const trips = await loadTrips();
  const activeTrip =
    trips.find(
      (trip) =>
        trip.localId === recordingSession.activeTripId &&
        trip.deletedAt === null &&
        trip.status === "active" &&
        trip.endedAt === null,
    ) ?? null;

  if (!activeTrip) {
    return;
  }

  const recordingTrip = activeTrip;
  const tripSegments = await loadTripSegments();
  let nextTripPoints = await loadTripPointsForTrip(recordingTrip.localId);
  const waypoints = await loadWaypoints();
  let nextWaypoints = waypoints;
  let nextTripSegments = tripSegments;
  let pointsChanged = false;
  let lastRecordedAt = recordingSession.lastPointRecordedAt;
  let nextRecordingSession = recordingSession;

  function appendSnapshotIfUseful(snapshot: CurrentLocationSnapshot): boolean {
    const fallbackOpenSegment = getOpenTripSegmentForTrip(nextTripSegments, recordingTrip.localId);
    const activeSegmentLocalId = nextRecordingSession.activeSegmentId ?? fallbackOpenSegment?.localId ?? null;
    const appendedTripPoints = appendTripPointIfUseful(
      nextTripPoints,
      createTripPointForLocation(recordingTrip, activeSegmentLocalId, snapshot),
      nextRecordingSession.recordingProfile,
      callbackSource,
      {
        sessionStartedAt: nextRecordingSession.startedAt,
        tripStartedAt: recordingTrip.startedAt,
      },
    );
    const pointsWereAppended = appendedTripPoints !== nextTripPoints;

    if (pointsWereAppended) {
      nextTripPoints = appendedTripPoints;
      pointsChanged = true;
      nextRecordingSession = updateRecordingLastPoint(nextRecordingSession, snapshot.recordedAt);
    }

    return pointsWereAppended;
  }

  for (const snapshot of snapshots) {
    recordLocationCallback(recordingTrip.localId, nextRecordingSession.recordingProfile, callbackSource, snapshot);
    const rawAutoSamples =
      nextRecordingSession.recordingMode === "auto"
        ? recordAutoRecordingSample(recordingTrip.localId, snapshot)
        : null;

    if (lastRecordedAt === snapshot.recordedAt) {
      recordTripPointDiagnostic(
        recordingTrip.localId,
        nextRecordingSession.recordingProfile,
        "session-duplicate-recorded-at",
        {
          recordedAt: snapshot.recordedAt,
          source: callbackSource,
        },
      );
      continue;
    }

    if (nextRecordingSession.recordingMode === "auto") {
      const motionActivity = await getLatestMotionActivityAsync(snapshot.recordedAt);

      nextRecordingSession = updateRecordingMotionActivity(nextRecordingSession, motionActivity);
      const autoTransition = applyAutoRecordingTransition(
        nextRecordingSession,
        recordingTrip,
        nextTripSegments,
        nextTripPoints,
        nextWaypoints,
        snapshot.recordedAt,
        motionActivity,
        rawAutoSamples,
      );

      nextRecordingSession = autoTransition.session;
      nextTripSegments = autoTransition.tripSegments;
      nextWaypoints = autoTransition.waypoints;

      if (autoTransition.changed) {
        await restartBackgroundLocationTracking(nextRecordingSession.recordingProfile);
        const recoverySnapshots = getRejectedAutoRecoverySnapshots(recordingTrip.localId, snapshot.recordedAt);
        const snapshotsToReevaluate = lastRecordedAt === snapshot.recordedAt
          ? recoverySnapshots
          : [...recoverySnapshots, snapshot];
        const acceptedRecoverySnapshots: CurrentLocationSnapshot[] = [];

        for (const recoverySnapshot of snapshotsToReevaluate) {
          if (appendSnapshotIfUseful(recoverySnapshot)) {
            acceptedRecoverySnapshots.push(recoverySnapshot);
          }
        }

        forgetRejectedAutoSnapshots(recordingTrip.localId, acceptedRecoverySnapshots);
        lastRecordedAt = snapshot.recordedAt;
        continue;
      }
    }

    if (lastRecordedAt !== snapshot.recordedAt) {
      const pointsWereAppended = appendSnapshotIfUseful(snapshot);

      if (!pointsWereAppended && nextRecordingSession.recordingMode === "auto") {
        rememberRejectedAutoSnapshot(recordingTrip.localId, snapshot);
      }
    }

    lastRecordedAt = snapshot.recordedAt;
  }

  const writes: Promise<void>[] = [];

  if (pointsChanged) {
    writes.push(mergeTripPoints(nextTripPoints));
  }

  if (nextTripSegments !== tripSegments) {
    writes.push(setTripSegments(nextTripSegments));
  }

  if (nextWaypoints !== waypoints) {
    writes.push(setWaypoints(nextWaypoints));
  }

  if (
    (lastRecordedAt && lastRecordedAt !== recordingSession.lastPointRecordedAt) ||
    nextRecordingSession.activeSegmentId !== recordingSession.activeSegmentId ||
    nextRecordingSession.autoCandidateProfile !== recordingSession.autoCandidateProfile ||
    nextRecordingSession.autoCandidateSince !== recordingSession.autoCandidateSince ||
    nextRecordingSession.recordingProfile !== recordingSession.recordingProfile ||
    nextRecordingSession.motionActivityType !== recordingSession.motionActivityType ||
    nextRecordingSession.motionActivityConfidence !== recordingSession.motionActivityConfidence ||
    nextRecordingSession.motionActivityRecordedAt !== recordingSession.motionActivityRecordedAt ||
    nextRecordingSession.motionActivitySourcePlatform !== recordingSession.motionActivitySourcePlatform
  ) {
    writes.push(setRecordingSession(nextRecordingSession));
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }
}

function enqueueRecordedLocationSnapshots(
  snapshots: CurrentLocationSnapshot[],
  callbackSource: LocationCallbackSource,
): Promise<void> {
  recordingPipelineWriteQueue = recordingPipelineWriteQueue
    .catch(() => undefined)
    .then(() => persistRecordedLocationSnapshots(snapshots, callbackSource));

  return recordingPipelineWriteQueue;
}

export function persistForegroundRecordedLocation(snapshot: CurrentLocationSnapshot): Promise<void> {
  return enqueueRecordedLocationSnapshots([snapshot], "foreground");
}

export function persistBackgroundRecordedLocations(locations: Location.LocationObject[]): Promise<void> {
  return enqueueRecordedLocationSnapshots(locations.map(toSnapshot), "background");
}
