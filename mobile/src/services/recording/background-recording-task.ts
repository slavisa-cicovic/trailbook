import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { BACKGROUND_RECORDING_LOCATION_TASK_NAME } from "../location/background-location.constants";
import { persistBackgroundRecordedLocations } from "./recording-engine.service";

interface BackgroundLocationTaskData {
  locations: Location.LocationObject[];
}

if (!TaskManager.isTaskDefined(BACKGROUND_RECORDING_LOCATION_TASK_NAME)) {
  TaskManager.defineTask<BackgroundLocationTaskData>(
    BACKGROUND_RECORDING_LOCATION_TASK_NAME,
    async ({ data, error }) => {
      if (error || !data?.locations?.length) {
        return;
      }

      await persistBackgroundRecordedLocations(data.locations, {
        // AUTO profile changes update Trailbook segments/filtering only.
        // Restarting Android background location updates while the app is asleep can leave
        // FusedLocation silent until the app wakes up again.
        restartTrackingOnAutoTransition: false,
      });
    },
  );
}
