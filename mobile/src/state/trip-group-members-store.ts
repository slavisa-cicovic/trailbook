import { useSyncExternalStore } from "react";

import type { TripGroupMember } from "../domain/trips";
import {
  loadTripGroupMembers,
  saveTripGroupMembers,
} from "../storage/trip-group-members-storage";

interface TripGroupMembersState {
  hydrated: boolean;
  tripGroupMembers: TripGroupMember[];
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: TripGroupMembersState = {
  hydrated: false,
  tripGroupMembers: [],
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(
  updater: TripGroupMembersState | ((currentState: TripGroupMembersState) => TripGroupMembersState),
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

export function getTripGroupMembersStateSnapshot() {
  return state;
}

export function useTripGroupMembersStore<T>(selector: (snapshot: TripGroupMembersState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateTripGroupMembersStore(): Promise<void> {
  const tripGroupMembers = await loadTripGroupMembers();

  setState({
    hydrated: true,
    tripGroupMembers,
  });
}

export async function setTripGroupMembers(tripGroupMembers: TripGroupMember[]): Promise<void> {
  setState((currentState) => ({
    ...currentState,
    tripGroupMembers,
  }));

  await saveTripGroupMembers(tripGroupMembers);
}
