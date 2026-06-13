import { create } from "zustand";

import { DEFAULT_RECORDING_PROFILE } from "../constants/recording-profiles";
import type { RecordingSessionSummary, Trip, TripSegment } from "../domain/trips";
import { reconcileRecordingSessionWithTrips } from "../services/recording/recording.service";
import { loadRecordingSession, saveRecordingSession } from "../storage/recording-storage";

export const initialRecordingSession: RecordingSessionSummary = {
  status: "idle",
  activeTripId: null,
  activeSegmentId: null,
  startedAt: null,
  lastPointRecordedAt: null,
  interruptedAt: null,
  userId: null,
  userEmail: null,
  deviceId: null,
  recordingMode: "auto",
  recordingProfile: DEFAULT_RECORDING_PROFILE,
  autoCandidateProfile: null,
  autoCandidateSince: null,
  motionActivityType: null,
  motionActivityConfidence: null,
  motionActivityRecordedAt: null,
  motionActivitySourcePlatform: null,
};

interface RecordingState {
  hydrated: boolean;
  session: RecordingSessionSummary;
}

export const useRecordingStore = create<RecordingState>(() => ({
  hydrated: false,
  session: initialRecordingSession,
}));

export function getRecordingStateSnapshot() {
  return useRecordingStore.getState();
}

export async function hydrateRecordingStore(): Promise<void> {
  const recordingSession = await loadRecordingSession();
  useRecordingStore.setState({
    hydrated: true,
    session: recordingSession ?? initialRecordingSession,
  });
}

export async function setRecordingSession(session: RecordingSessionSummary): Promise<void> {
  useRecordingStore.setState({ session });
  await saveRecordingSession(session);
}

export async function reconcileHydratedRecordingState(
  trips: Trip[],
  tripSegments: TripSegment[],
): Promise<void> {
  const reconciledSession = reconcileRecordingSessionWithTrips(
    useRecordingStore.getState().session,
    trips,
    tripSegments,
    new Date().toISOString(),
  );
  useRecordingStore.setState({ session: reconciledSession });
  await saveRecordingSession(reconciledSession);
}
