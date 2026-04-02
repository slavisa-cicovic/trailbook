import { useSyncExternalStore } from "react";

import type { TripPoint } from "../domain/trips";
import { loadTripPoints, saveTripPoints } from "../storage/trip-points-storage";

interface TripPointsState {
  hydrated: boolean;
  tripPoints: TripPoint[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: TripPointsState = {
  hydrated: false,
  tripPoints: [],
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(updater: TripPointsState | ((currentState: TripPointsState) => TripPointsState)) {
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

export function useTripPointsStore<T>(selector: (snapshot: TripPointsState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export function getTripPointsStateSnapshot() {
  return state;
}

export async function hydrateTripPointsStore(): Promise<void> {
  const tripPoints = await loadTripPoints();

  setState({
    hydrated: true,
    tripPoints,
  });
}

export async function setTripPoints(tripPoints: TripPoint[]): Promise<void> {
  setState((currentState) => ({
    ...currentState,
    tripPoints,
  }));

  await saveTripPoints(tripPoints);
}
