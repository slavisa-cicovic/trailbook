import { useSyncExternalStore } from "react";

import type { RecordingSessionSummary, Trip } from "../domain/trips";
import {
  reconcileRecordingSessionWithTrips,
} from "../services/recording/recording.service";
import { loadRecordingSession, saveRecordingSession } from "../storage/recording-storage";

export const initialRecordingSession: RecordingSessionSummary = {
  status: "idle",
  activeTripId: null,
  startedAt: null,
  lastPointRecordedAt: null,
  interruptedAt: null,
  userId: null,
  userEmail: null,
  deviceId: null,
};

interface RecordingState {
  hydrated: boolean;
  session: RecordingSessionSummary;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: RecordingState = {
  hydrated: false,
  session: initialRecordingSession,
};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(updater: RecordingState | ((currentState: RecordingState) => RecordingState)) {
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

export function getRecordingStateSnapshot() {
  return state;
}

export function useRecordingStore<T>(selector: (snapshot: RecordingState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateRecordingStore(): Promise<void> {
  const recordingSession = await loadRecordingSession();

  setState({
    hydrated: true,
    session: recordingSession ?? initialRecordingSession,
  });
}

export async function setRecordingSession(session: RecordingSessionSummary): Promise<void> {
  setState((currentState) => ({
    ...currentState,
    session,
  }));

  await saveRecordingSession(session);
}

export async function reconcileHydratedRecordingState(trips: Trip[]): Promise<void> {
  const reconciledSession = reconcileRecordingSessionWithTrips(
    state.session,
    trips,
    new Date().toISOString(),
  );

  setState((currentState) => ({
    ...currentState,
    session: reconciledSession,
  }));

  await saveRecordingSession(reconciledSession);
}
