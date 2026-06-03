import { create } from "zustand";

import type { TripGroup } from "../domain/trips";
import { loadTripGroups, saveTripGroups } from "../storage/trip-groups-storage";

interface TripGroupsState {
  hydrated: boolean;
  tripGroups: TripGroup[];
}

export const useTripGroupsStore = create<TripGroupsState>(() => ({
  hydrated: false,
  tripGroups: [],
}));

export function getTripGroupsStateSnapshot() {
  return useTripGroupsStore.getState();
}

export async function hydrateTripGroupsStore(): Promise<void> {
  const tripGroups = await loadTripGroups();
  useTripGroupsStore.setState({ hydrated: true, tripGroups });
}

export async function setTripGroups(tripGroups: TripGroup[]): Promise<void> {
  useTripGroupsStore.setState({ tripGroups });
  await saveTripGroups(tripGroups);
}
