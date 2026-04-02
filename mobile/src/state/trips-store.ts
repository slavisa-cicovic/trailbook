import { useSyncExternalStore } from "react";

import type { Trip } from "../domain/trips";
import { loadTrips, saveTrips } from "../storage/trips-storage";

interface TripsState {
  hydrated: boolean;
  trips: Trip[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: TripsState = {
  hydrated: false,
  trips: [],
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(updater: TripsState | ((currentState: TripsState) => TripsState)) {
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

export function getTripsStateSnapshot() {
  return state;
}

export function useTripsStore<T>(selector: (snapshot: TripsState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateTripsStore(): Promise<void> {
  const trips = await loadTrips();

  setState({
    hydrated: true,
    trips,
  });
}

export async function setTrips(trips: Trip[]): Promise<void> {
  setState((currentState) => ({
    ...currentState,
    trips,
  }));

  await saveTrips(trips);
}
