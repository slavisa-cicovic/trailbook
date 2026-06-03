import { create } from "zustand";

import type { TripGroupMember } from "../domain/trips";
import {
  loadTripGroupMembers,
  saveTripGroupMembers,
} from "../storage/trip-group-members-storage";

interface TripGroupMembersState {
  hydrated: boolean;
  tripGroupMembers: TripGroupMember[];
}

export const useTripGroupMembersStore = create<TripGroupMembersState>(() => ({
  hydrated: false,
  tripGroupMembers: [],
}));

export function getTripGroupMembersStateSnapshot() {
  return useTripGroupMembersStore.getState();
}

export async function hydrateTripGroupMembersStore(): Promise<void> {
  const tripGroupMembers = await loadTripGroupMembers();
  useTripGroupMembersStore.setState({ hydrated: true, tripGroupMembers });
}

export async function setTripGroupMembers(tripGroupMembers: TripGroupMember[]): Promise<void> {
  useTripGroupMembersStore.setState({ tripGroupMembers });
  await saveTripGroupMembers(tripGroupMembers);
}
