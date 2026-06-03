import { create } from "zustand";

import type { TripSegment } from "../domain/trips";
import { loadTripSegments, saveTripSegments } from "../storage/trip-segments-storage";

interface TripSegmentsState {
  hydrated: boolean;
  tripSegments: TripSegment[];
}

export const useTripSegmentsStore = create<TripSegmentsState>(() => ({
  hydrated: false,
  tripSegments: [],
}));

function dedupeTripSegmentsByLocalId(tripSegments: TripSegment[]): TripSegment[] {
  const tripSegmentsByLocalId = new Map<string, TripSegment>();
  for (const tripSegment of tripSegments) {
    tripSegmentsByLocalId.set(tripSegment.localId, tripSegment);
  }
  return Array.from(tripSegmentsByLocalId.values());
}

export function getTripSegmentsStateSnapshot() {
  return useTripSegmentsStore.getState();
}

export async function hydrateTripSegmentsStore(): Promise<void> {
  const tripSegments = await loadTripSegments();
  useTripSegmentsStore.setState({ hydrated: true, tripSegments: dedupeTripSegmentsByLocalId(tripSegments) });
}

export async function setTripSegments(tripSegments: TripSegment[]): Promise<void> {
  const previousTripSegments = useTripSegmentsStore.getState().tripSegments;
  const nextTripSegments = dedupeTripSegmentsByLocalId(tripSegments);
  useTripSegmentsStore.setState({ tripSegments: nextTripSegments });
  await saveTripSegments(nextTripSegments, previousTripSegments);
}
