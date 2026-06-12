import { create } from "zustand";

import type { TripPoint } from "../domain/trips";
import { saveTripPoints } from "../storage/trip-points-storage";

interface TripPointsState {
  hydrated: boolean;
  tripPoints: TripPoint[];
}

export const useTripPointsStore = create<TripPointsState>(() => ({
  hydrated: false,
  tripPoints: [],
}));

// Keep this store scoped to the active/selected trip. Full point loads stay in storage helpers.

export function setTripPointsInMemory(tripPoints: TripPoint[]): void {
  useTripPointsStore.setState({ hydrated: true, tripPoints });
}

export function mergeTripPointsInMemory(tripPoints: TripPoint[]): void {
  if (tripPoints.length === 0) {
    useTripPointsStore.setState({ hydrated: true });
    return;
  }

  const currentPoints = useTripPointsStore.getState().tripPoints;
  const nextTripPointsById = new Map(currentPoints.map((p) => [p.localId, p]));
  for (const tripPoint of tripPoints) {
    nextTripPointsById.set(tripPoint.localId, tripPoint);
  }

  useTripPointsStore.setState({
    hydrated: true,
    tripPoints: Array.from(nextTripPointsById.values()).sort((l, r) =>
      l.recordedAt.localeCompare(r.recordedAt),
    ),
  });
}

export async function mergeTripPoints(tripPoints: TripPoint[]): Promise<void> {
  if (tripPoints.length === 0) {
    return;
  }

  const tripLocalIds = Array.from(new Set(tripPoints.map((p) => p.tripLocalId)));
  const tripLocalId = tripLocalIds[0];
  const currentPoints = useTripPointsStore.getState().tripPoints;
  const previousTripPoints = currentPoints.filter((p) => p.tripLocalId === tripLocalId);
  const nextTripPointsById = new Map(previousTripPoints.map((p) => [p.localId, p]));

  for (const tripPoint of tripPoints.filter((c) => c.tripLocalId === tripLocalId)) {
    nextTripPointsById.set(tripPoint.localId, tripPoint);
  }

  const nextTripPoints = Array.from(nextTripPointsById.values()).sort((l, r) =>
    l.recordedAt.localeCompare(r.recordedAt),
  );

  useTripPointsStore.setState({ hydrated: true, tripPoints: nextTripPoints });
  await saveTripPoints(nextTripPoints, previousTripPoints);
}
