import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { BACKGROUND_RECORDING_LOCATION_TASK_NAME } from "../location/background-location.constants";
import { toSnapshot } from "../location/location.service";
import {
  appendTripPointIfUseful,
  createTripPointForLocation,
} from "../trip-points/trip-points.service";
import { updateRecordingLastPoint } from "./recording.service";
import { setRecordingSession } from "../../state/recording-store";
import { setTripPoints } from "../../state/trip-points-store";
import { loadRecordingSession } from "../../storage/recording-storage";
import { loadTripPoints } from "../../storage/trip-points-storage";
import { loadTrips } from "../../storage/trips-storage";

interface BackgroundLocationTaskData {
  locations: Location.LocationObject[];
}

async function persistRecordedLocations(locations: Location.LocationObject[]): Promise<void> {
  const recordingSession = await loadRecordingSession();

  if (!recordingSession || recordingSession.status !== "recording" || !recordingSession.activeTripId) {
    return;
  }

  const trips = await loadTrips();
  const activeTrip =
    trips.find(
      (trip) =>
        trip.localId === recordingSession.activeTripId &&
        trip.deletedAt === null &&
        trip.endedAt === null,
    ) ?? null;

  if (!activeTrip) {
    return;
  }

  let nextTripPoints = await loadTripPoints();
  let pointsChanged = false;
  let lastRecordedAt = recordingSession.lastPointRecordedAt;

  for (const location of locations) {
    const snapshot = toSnapshot(location);

    if (lastRecordedAt === snapshot.recordedAt) {
      continue;
    }

    const appendedTripPoints = appendTripPointIfUseful(
      nextTripPoints,
      createTripPointForLocation(activeTrip, snapshot),
    );

    if (appendedTripPoints !== nextTripPoints) {
      nextTripPoints = appendedTripPoints;
      pointsChanged = true;
    }

    lastRecordedAt = snapshot.recordedAt;
  }

  const writes: Promise<void>[] = [];

  if (pointsChanged) {
    writes.push(setTripPoints(nextTripPoints));
  }

  if (lastRecordedAt && lastRecordedAt !== recordingSession.lastPointRecordedAt) {
    writes.push(setRecordingSession(updateRecordingLastPoint(recordingSession, lastRecordedAt)));
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
