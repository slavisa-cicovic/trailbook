import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { BACKGROUND_RECORDING_LOCATION_TASK_NAME } from "../location/background-location.constants";
import { toSnapshot } from "../location/location.service";
import {
  appendTripPointIfUseful,
  createTripPointForLocation,
  recordLocationCallback,
  recordTripPointDiagnostic,
} from "../trip-points/trip-points.service";
import { applyAutoRecordingTransition } from "./auto-recording.service";
import { updateRecordingLastPoint } from "./recording.service";
import { setRecordingSession } from "../../state/recording-store";
import { setTripSegments } from "../../state/trip-segments-store";
import { setTripPoints } from "../../state/trip-points-store";
import { setWaypoints } from "../../state/waypoints-store";
import { loadRecordingSession } from "../../storage/recording-storage";
import { loadTripPoints } from "../../storage/trip-points-storage";
import { loadTripSegments } from "../../storage/trip-segments-storage";
import { loadTrips } from "../../storage/trips-storage";
import { loadWaypoints } from "../../storage/waypoints-storage";

interface BackgroundLocationTaskData {
  locations: Location.LocationObject[];
}

async function persistRecordedLocations(locations: Location.LocationObject[]): Promise<void> {
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

  const tripSegments = await loadTripSegments();
  const activeSegmentById = recordingSession.activeSegmentId
    ? tripSegments.find((segment) => segment.localId === recordingSession.activeSegmentId)
    : undefined;
  const activeOpenSegment = tripSegments.find(
    (segment) => segment.tripLocalId === activeTrip.localId && segment.endedAt === null,
  );
  const activeSegment = activeSegmentById ?? activeOpenSegment ?? null;

  let nextTripPoints = await loadTripPoints();
  const waypoints = await loadWaypoints();
  let nextWaypoints = waypoints;
  let nextTripSegments = tripSegments;
  let pointsChanged = false;
  let lastRecordedAt = recordingSession.lastPointRecordedAt;
  let nextRecordingSession = recordingSession;

  for (const location of locations) {
    const snapshot = toSnapshot(location);
    recordLocationCallback(activeTrip.localId, nextRecordingSession.recordingMode, "background", snapshot);

    if (lastRecordedAt === snapshot.recordedAt) {
      recordTripPointDiagnostic(
        activeTrip.localId,
        nextRecordingSession.recordingMode,
        "session-duplicate-recorded-at",
        {
          recordedAt: snapshot.recordedAt,
          source: "background",
        },
      );
      continue;
    }

    const appendedTripPoints = appendTripPointIfUseful(
      nextTripPoints,
      createTripPointForLocation(activeTrip, nextRecordingSession.activeSegmentId ?? activeSegment?.localId ?? null, snapshot),
      nextRecordingSession.recordingMode,
      "background",
    );

    if (appendedTripPoints !== nextTripPoints) {
      nextTripPoints = appendedTripPoints;
      pointsChanged = true;
      nextRecordingSession = updateRecordingLastPoint(nextRecordingSession, snapshot.recordedAt);
      const autoTransition = applyAutoRecordingTransition(
        nextRecordingSession,
        activeTrip,
        nextTripSegments,
        nextTripPoints,
        nextWaypoints,
        snapshot.recordedAt,
      );

      nextRecordingSession = autoTransition.session;
      nextTripSegments = autoTransition.tripSegments;
      nextWaypoints = autoTransition.waypoints;
    }

    lastRecordedAt = snapshot.recordedAt;
  }

  const writes: Promise<void>[] = [];

  if (pointsChanged) {
    writes.push(setTripPoints(nextTripPoints));
    if (nextTripSegments !== tripSegments) {
      writes.push(setTripSegments(nextTripSegments));
    }
    if (nextWaypoints !== waypoints) {
      writes.push(setWaypoints(nextWaypoints));
    }
  }

  if (
    (lastRecordedAt && lastRecordedAt !== recordingSession.lastPointRecordedAt) ||
    nextRecordingSession.activeSegmentId !== recordingSession.activeSegmentId ||
    nextRecordingSession.autoCandidateProfile !== recordingSession.autoCandidateProfile ||
    nextRecordingSession.autoCandidateSince !== recordingSession.autoCandidateSince ||
    nextRecordingSession.recordingProfile !== recordingSession.recordingProfile
  ) {
    writes.push(setRecordingSession(nextRecordingSession));
  }

  if (writes.length > 0) {
    await Promise.all(writes);
  }
}

if (!TaskManager.isTaskDefined(BACKGROUND_RECORDING_LOCATION_TASK_NAME)) {
  TaskManager.defineTask<BackgroundLocationTaskData>(
    BACKGROUND_RECORDING_LOCATION_TASK_NAME,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) {
        return;
      }

      await persistRecordedLocations(data.locations);
    },
  );
}
