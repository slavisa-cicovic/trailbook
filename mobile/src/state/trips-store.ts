import { create } from "zustand";

import type { Trip } from "../domain/trips";
import { loadTrips, saveTrips } from "../storage/trips-storage";

interface TripsState {
  hydrated: boolean;
  trips: Trip[];
}

export const useTripsStore = create<TripsState>(() => ({
  hydrated: false,
  trips: [],
}));

export function getTripsStateSnapshot() {
  return useTripsStore.getState();
}

export async function hydrateTripsStore(): Promise<void> {
  const trips = await loadTrips();
  useTripsStore.setState({ hydrated: true, trips });
}

export async function setTrips(trips: Trip[]): Promise<void> {
  useTripsStore.setState({ trips });
  await saveTrips(trips);
}
