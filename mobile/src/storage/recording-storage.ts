import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_RECORDING_PROFILE,
  normalizeRecordingMode,
  normalizeRecordingProfile,
} from "../constants/recording-profiles";
import { STORAGE_KEYS } from "../constants/storage-keys";
import {
  normalizeMotionActivityConfidence,
  normalizeMotionActivitySourcePlatform,
  normalizeMotionActivityType,
} from "../domain/motion-activity";
import type { RecordingSessionSummary } from "../domain/trips";
import { loadJsonRecord, saveJsonRecord } from "./app-kv-storage";
import { migrateOnce } from "./sqlite/migrate-once";

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
    motionActivityType: value.motionActivityType ? normalizeMotionActivityType(value.motionActivityType) : null,
    motionActivityConfidence: value.motionActivityConfidence
      ? normalizeMotionActivityConfidence(value.motionActivityConfidence)
      : null,
    motionActivityRecordedAt: value.motionActivityRecordedAt ?? null,
    motionActivitySourcePlatform: value.motionActivitySourcePlatform
      ? normalizeMotionActivitySourcePlatform(value.motionActivitySourcePlatform)
      : null,
  };
}

async function ensureRecordingSessionMigrated(): Promise<void> {
  await migrateOnce("async-storage/recording-session", async () => {
    const existingRecord = await loadJsonRecord<RecordingSessionSummary>(STORAGE_KEYS.recording);

    if (existingRecord) {
      return;
    }

    const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.recording);

    if (!rawValue) {
      return;
    }

    await saveJsonRecord(STORAGE_KEYS.recording, normalizeRecordingSession(JSON.parse(rawValue) as RecordingSessionSummary));
  });
}

export async function loadRecordingSession(): Promise<RecordingSessionSummary | null> {
  await ensureRecordingSessionMigrated();

  const record = await loadJsonRecord<RecordingSessionSummary>(STORAGE_KEYS.recording);
  return record ? normalizeRecordingSession(record) : null;
}

export async function saveRecordingSession(recordingSession: RecordingSessionSummary): Promise<void> {
  await ensureRecordingSessionMigrated();
  await saveJsonRecord(STORAGE_KEYS.recording, recordingSession);
}
