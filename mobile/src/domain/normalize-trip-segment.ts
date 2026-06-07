import { DEFAULT_RECORDING_PROFILE, normalizeRecordingProfile } from "../constants/recording-profiles";
import type { TripSegment } from "./trips";

export function normalizeTripSegment(
  value: Partial<TripSegment> & Pick<TripSegment, "localId" | "tripLocalId" | "deviceId" | "userId">,
): TripSegment {
  const fallbackDate = new Date(0).toISOString();

  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    deviceId: value.deviceId,
    userId: value.userId,
    recordingProfile: normalizeRecordingProfile(value.recordingProfile ?? DEFAULT_RECORDING_PROFILE),
    pointCount: value.pointCount ?? null,
    distanceMeters: value.distanceMeters ?? null,
    durationMs: value.durationMs ?? null,
    statsUpdatedAt: value.statsUpdatedAt ?? null,
    startedAt: value.startedAt ?? fallbackDate,
    endedAt: value.endedAt ?? null,
    createdAt: value.createdAt ?? value.startedAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.startedAt ?? fallbackDate,
    syncStatus: value.syncStatus ?? "local-only",
  };
}
