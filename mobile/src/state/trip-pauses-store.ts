import { create } from "zustand";

import type { TripPause } from "../domain/trips";
import { loadTripPauses, saveTripPauses } from "../storage/trip-pauses-storage";

interface TripPausesState {
  hydrated: boolean;
  tripPauses: TripPause[];
}

export const useTripPausesStore = create<TripPausesState>(() => ({
  hydrated: false,
  tripPauses: [],
}));

export async function hydrateTripPausesStore(): Promise<void> {
  const tripPauses = await loadTripPauses();
  useTripPausesStore.setState({ hydrated: true, tripPauses });
}

export async function setTripPauses(tripPauses: TripPause[]): Promise<void> {
  useTripPausesStore.setState({ tripPauses });
  await saveTripPauses(tripPauses);
}
