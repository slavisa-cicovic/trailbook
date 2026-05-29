import { useEffect } from "react";

import {
  hydrateRecordingStore,
  reconcileHydratedRecordingState,
  useRecordingStore,
} from "../../state/recording-store";
import { hydrateSessionStore, useSessionStore } from "../../state/session-store";
import { hydrateThemeStore, useThemeStore } from "../../state/theme-store";
import { hydrateTripGroupMembersStore, useTripGroupMembersStore } from "../../state/trip-group-members-store";
import { hydrateTripGroupsStore, useTripGroupsStore } from "../../state/trip-groups-store";
import { hydrateTripPausesStore, useTripPausesStore } from "../../state/trip-pauses-store";
import {
  getTripSegmentsStateSnapshot,
  hydrateTripSegmentsStore,
  useTripSegmentsStore,
} from "../../state/trip-segments-store";
import { getTripsStateSnapshot, hydrateTripsStore, useTripsStore } from "../../state/trips-store";
import { hydrateWaypointAttachmentsStore, useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { hydrateWaypointsStore, useWaypointsStore } from "../../state/waypoints-store";

export interface AppHydrationResult {
  appHydrated: boolean;
  recordingHydrated: boolean;
  sessionHydrated: boolean;
  tripSegmentsHydrated: boolean;
  tripsHydrated: boolean;
}

export function useAppHydration(): AppHydrationResult {
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const themeHydrated = useThemeStore((s) => s.hydrated);
  const recordingHydrated = useRecordingStore((s) => s.hydrated);
  const tripsHydrated = useTripsStore((s) => s.hydrated);
  const tripSegmentsHydrated = useTripSegmentsStore((s) => s.hydrated);
  const tripGroupsHydrated = useTripGroupsStore((s) => s.hydrated);
  const tripGroupMembersHydrated = useTripGroupMembersStore((s) => s.hydrated);
  const tripPausesHydrated = useTripPausesStore((s) => s.hydrated);
  const waypointsHydrated = useWaypointsStore((s) => s.hydrated);
  const waypointAttachmentsHydrated = useWaypointAttachmentsStore((s) => s.hydrated);

  useEffect(() => {
    async function hydrateAppState() {
      await Promise.all([
        hydrateThemeStore(),
        hydrateSessionStore(),
        hydrateRecordingStore(),
        hydrateTripsStore(),
        hydrateTripPausesStore(),
        hydrateTripSegmentsStore(),
        hydrateTripGroupsStore(),
        hydrateTripGroupMembersStore(),
        hydrateWaypointsStore(),
        hydrateWaypointAttachmentsStore(),
      ]);
      await reconcileHydratedRecordingState(
        getTripsStateSnapshot().trips,
        getTripSegmentsStateSnapshot().tripSegments,
      );
    }

    void hydrateAppState();
  }, []);

  const appHydrated =
    sessionHydrated &&
    themeHydrated &&
    recordingHydrated &&
    tripsHydrated &&
    tripSegmentsHydrated &&
    tripGroupsHydrated &&
    tripGroupMembersHydrated &&
    tripPausesHydrated &&
    waypointsHydrated &&
    waypointAttachmentsHydrated;

  return {
    appHydrated,
    recordingHydrated,
    sessionHydrated,
    tripSegmentsHydrated,
    tripsHydrated,
  };
}
