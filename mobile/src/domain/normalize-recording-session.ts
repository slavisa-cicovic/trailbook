import {
  DEFAULT_RECORDING_PROFILE,
  normalizeRecordingMode,
  normalizeRecordingProfile,
} from "../constants/recording-profiles";
import {
  normalizeMotionActivityConfidence,
  normalizeMotionActivitySourcePlatform,
  normalizeMotionActivityType,
} from "./motion-activity";
import type { RecordingSessionSummary } from "./trips";

export function normalizeRecordingSession(
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
