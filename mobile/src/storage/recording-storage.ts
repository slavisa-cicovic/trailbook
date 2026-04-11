import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_RECORDING_PROFILE,
  normalizeRecordingMode,
  normalizeRecordingProfile,
} from "../constants/recording-profiles";
import { STORAGE_KEYS } from "../constants/storage-keys";
import type { RecordingSessionSummary } from "../domain/trips";

function normalizeRecordingSession(
  value: Partial<RecordingSessionSummary> & { isRecording?: boolean },
): RecordingSessionSummary {
  const inferredStatus =
    value.status ??
    (value.isRecording ? "recording" : "idle");

  return {
    status: inferredStatus,
    activeTripId: value.activeTripId ?? null,
    activeSegmentId: value.activeSegmentId ?? null,
    startedAt: value.startedAt ?? null,
    lastPointRecordedAt: value.lastPointRecordedAt ?? null,
    interruptedAt: value.interruptedAt ?? null,
    userId: value.userId ?? null,
    userEmail: value.userEmail ?? null,
    deviceId: value.deviceId ?? null,
    recordingMode: normalizeRecordingMode(value.recordingMode ?? value.recordingProfile ?? DEFAULT_RECORDING_PROFILE),
    recordingProfile: normalizeRecordingProfile(value.recordingProfile ?? DEFAULT_RECORDING_PROFILE),
    autoCandidateProfile:
      value.autoCandidateProfile ? normalizeRecordingProfile(value.autoCandidateProfile) : null,
    autoCandidateSince: value.autoCandidateSince ?? null,
  };
}

export async function loadRecordingSession(): Promise<RecordingSessionSummary | null> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.recording);

  if (!rawValue) {
    return null;
  }

  return normalizeRecordingSession(JSON.parse(rawValue) as RecordingSessionSummary);
}

export async function saveRecordingSession(
  recordingSession: RecordingSessionSummary,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.recording, JSON.stringify(recordingSession));
}
