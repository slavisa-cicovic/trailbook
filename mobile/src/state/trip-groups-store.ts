import { useSyncExternalStore } from "react";

import type { TripGroup } from "../domain/trips";
import { loadTripGroups, saveTripGroups } from "../storage/trip-groups-storage";

interface TripGroupsState {
  hydrated: boolean;
  tripGroups: TripGroup[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: TripGroupsState = {
  hydrated: false,
  tripGroups: [],
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(updater: TripGroupsState | ((currentState: TripGroupsState) => TripGroupsState)) {
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

export function getTripGroupsStateSnapshot() {
  return state;
}

export function useTripGroupsStore<T>(selector: (snapshot: TripGroupsState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateTripGroupsStore(): Promise<void> {
  const tripGroups = await loadTripGroups();

  setState({
    hydrated: true,
    tripGroups,
  });
}

export async function setTripGroups(tripGroups: TripGroup[]): Promise<void> {
  setState((currentState) => ({
    ...currentState,
    tripGroups,
  }));

  await saveTripGroups(tripGroups);
}
