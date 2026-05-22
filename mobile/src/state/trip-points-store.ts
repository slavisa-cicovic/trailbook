import { useSyncExternalStore } from "react";

import type { TripPoint } from "../domain/trips";
import { replaceTripPointsForTrip } from "../storage/trip-points-storage";

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

// Keep this store scoped to the active/selected trip. Full point loads stay in storage helpers.

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

export function setTripPointsInMemory(tripPoints: TripPoint[]): void {
  setState((currentState) => ({
    ...currentState,
    hydrated: true,
    tripPoints,
  }));
}

export function mergeTripPointsInMemory(tripPoints: TripPoint[]): void {
  if (tripPoints.length === 0) {
    setState((currentState) => ({
      ...currentState,
      hydrated: true,
    }));
    return;
  }

  setState((currentState) => {
    const nextTripPointsById = new Map(currentState.tripPoints.map((tripPoint) => [tripPoint.localId, tripPoint]));

    for (const tripPoint of tripPoints) {
      nextTripPointsById.set(tripPoint.localId, tripPoint);
    }

    return {
      ...currentState,
      hydrated: true,
      tripPoints: Array.from(nextTripPointsById.values()).sort((left, right) =>
        left.recordedAt.localeCompare(right.recordedAt),
      ),
    };
  });
}

export async function mergeTripPoints(tripPoints: TripPoint[]): Promise<void> {
  if (tripPoints.length === 0) {
    return;
  }

  const tripLocalIds = Array.from(new Set(tripPoints.map((tripPoint) => tripPoint.tripLocalId)));
  const tripLocalId = tripLocalIds[0];
  const previousTripPoints = state.tripPoints.filter((tripPoint) => tripPoint.tripLocalId === tripLocalId);
  const nextTripPointsById = new Map(previousTripPoints.map((tripPoint) => [tripPoint.localId, tripPoint]));

  for (const tripPoint of tripPoints.filter((candidate) => candidate.tripLocalId === tripLocalId)) {
    nextTripPointsById.set(tripPoint.localId, tripPoint);
  }

  const nextTripPoints = Array.from(nextTripPointsById.values()).sort((left, right) =>
    left.recordedAt.localeCompare(right.recordedAt),
  );

  setState((currentState) => ({
    ...currentState,
    hydrated: true,
    tripPoints: nextTripPoints,
  }));

  await replaceTripPointsForTrip(tripLocalId, nextTripPoints);
}
