import { create } from "zustand";

import type { Waypoint } from "../domain/trips";
import { loadWaypoints, saveWaypoints } from "../storage/waypoints-storage";

interface WaypointsState {
  hydrated: boolean;
  waypoints: Waypoint[];
}

export const useWaypointsStore = create<WaypointsState>(() => ({
  hydrated: false,
  waypoints: [],
}));

export async function hydrateWaypointsStore(): Promise<void> {
  const waypoints = await loadWaypoints();
  useWaypointsStore.setState({ hydrated: true, waypoints });
}

export async function setWaypoints(waypoints: Waypoint[]): Promise<void> {
  const previousWaypoints = useWaypointsStore.getState().waypoints;
  useWaypointsStore.setState({ waypoints });
  await saveWaypoints(waypoints, previousWaypoints);
}
