import { useSyncExternalStore } from "react";

import type { TripPause } from "../domain/trips";
import { loadTripPauses, saveTripPauses } from "../storage/trip-pauses-storage";

interface TripPausesState {
  hydrated: boolean;
  tripPauses: TripPause[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: TripPausesState = {
  hydrated: false,
  tripPauses: [],
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(updater: TripPausesState | ((currentState: TripPausesState) => TripPausesState)) {
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

export function useTripPausesStore<T>(selector: (snapshot: TripPausesState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateTripPausesStore(): Promise<void> {
  const tripPauses = await loadTripPauses();

  setState({
    hydrated: true,
    tripPauses,
  });
}

export async function setTripPauses(tripPauses: TripPause[]): Promise<void> {
  setState((currentState) => ({
    ...currentState,
    tripPauses,
  }));

  await saveTripPauses(tripPauses);
}
