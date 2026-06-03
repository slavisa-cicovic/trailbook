import { useEffect } from "react";

import {
  hydrateRecordingStore,
  reconcileHydratedRecordingState,
  useRecordingStore,
} from "../../state/recording-store";
import { hydrateSessionStore, useSessionStore } from "../../state/session-store";
import { hydrateThemeStore, useThemeStore } from "../../state/theme-store";
import { hydrateTripPausesStore } from "../../state/trip-pauses-store";
import {
  getTripSegmentsStateSnapshot,
  hydrateTripSegmentsStore,
  useTripSegmentsStore,
} from "../../state/trip-segments-store";
import { getTripsStateSnapshot, hydrateTripsStore, useTripsStore } from "../../state/trips-store";
import { hydrateWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { hydrateWaypointsStore } from "../../state/waypoints-store";

export interface AppHydrationResult {
  coreHydrated: boolean;
  recordingHydrated: boolean;
  sessionHydrated: boolean;
  tripSegmentsHydrated: boolean;
  tripsHydrated: boolean;
}

async function hydrateBackground() {
  await Promise.all([
    hydrateTripsStore(),
    hydrateTripSegmentsStore(),
    hydrateTripPausesStore(),
    hydrateWaypointsStore(),
    hydrateWaypointAttachmentsStore(),
  ]);
  await reconcileHydratedRecordingState(
    getTripsStateSnapshot().trips,
    getTripSegmentsStateSnapshot().tripSegments,
  );
}

export function useAppHydration(): AppHydrationResult {
  const sessionHydrated = useSessionStore((s) => s.hydrated);
  const themeHydrated = useThemeStore((s) => s.hydrated);
  const recordingHydrated = useRecordingStore((s) => s.hydrated);
  const tripsHydrated = useTripsStore((s) => s.hydrated);
  const tripSegmentsHydrated = useTripSegmentsStore((s) => s.hydrated);

  // Phase 1: session + theme + recording (AsyncStorage/SecureStore — fast)
  // Phase 2: everything else (SQLite — starts after phase 1, runs in background)
  useEffect(() => {
    async function hydrate() {
      await Promise.all([
        hydrateSessionStore(),
        hydrateThemeStore(),
        hydrateRecordingStore(),
      ]);
      void hydrateBackground();
    }

    void hydrate();
  }, []);

  const coreHydrated = sessionHydrated && themeHydrated && recordingHydrated;

  return {
    coreHydrated,
    recordingHydrated,
    sessionHydrated,
    tripSegmentsHydrated,
    tripsHydrated,
  };
}
