import { useSyncExternalStore } from "react";

import type { Waypoint } from "../domain/trips";
import { loadWaypoints, saveWaypoints } from "../storage/waypoints-storage";

interface WaypointsState {
  hydrated: boolean;
  waypoints: Waypoint[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: WaypointsState = {
  hydrated: false,
  waypoints: [],
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(updater: WaypointsState | ((currentState: WaypointsState) => WaypointsState)) {
  state = typeof updater === "function" ? updater(state) : updater;
  emitChange();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useWaypointsStore<T>(selector: (snapshot: WaypointsState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateWaypointsStore(): Promise<void> {
  const waypoints = await loadWaypoints();

  setState({
    hydrated: true,
    waypoints,
  });
}

export async function setWaypoints(waypoints: Waypoint[]): Promise<void> {
  const previousWaypoints = state.waypoints;

  setState((currentState) => ({
    ...currentState,
    waypoints,
  }));

  await saveWaypoints(waypoints, previousWaypoints);
}
