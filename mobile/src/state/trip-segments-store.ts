import { useSyncExternalStore } from "react";

import type { TripSegment } from "../domain/trips";
import { loadTripSegments, saveTripSegments } from "../storage/trip-segments-storage";

interface TripSegmentsState {
  hydrated: boolean;
  tripSegments: TripSegment[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: TripSegmentsState = {
  hydrated: false,
  tripSegments: [],
};

function dedupeTripSegmentsByLocalId(tripSegments: TripSegment[]): TripSegment[] {
  const tripSegmentsByLocalId = new Map<string, TripSegment>();

  for (const tripSegment of tripSegments) {
    tripSegmentsByLocalId.set(tripSegment.localId, tripSegment);
  }

  return Array.from(tripSegmentsByLocalId.values());
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(
  updater: TripSegmentsState | ((currentState: TripSegmentsState) => TripSegmentsState),
) {
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

export function useTripSegmentsStore<T>(selector: (snapshot: TripSegmentsState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export function getTripSegmentsStateSnapshot() {
  return state;
}

export async function hydrateTripSegmentsStore(): Promise<void> {
  const tripSegments = await loadTripSegments();

  setState({
    hydrated: true,
    tripSegments: dedupeTripSegmentsByLocalId(tripSegments),
  });
}

export async function setTripSegments(tripSegments: TripSegment[]): Promise<void> {
  const previousTripSegments = state.tripSegments;
  const nextTripSegments = dedupeTripSegmentsByLocalId(tripSegments);

  setState((currentState) => ({
    ...currentState,
    tripSegments: nextTripSegments,
  }));

  await saveTripSegments(nextTripSegments, previousTripSegments);
}
