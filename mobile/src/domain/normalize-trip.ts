import { DEFAULT_RECORDING_PROFILE, normalizeRecordingProfile } from "../constants/recording-profiles";
import type { Trip, TripStatus } from "./trips";

export function inferTripStatus(value: Partial<Trip>): TripStatus {
  if (value.status === "active" || value.status === "paused" || value.status === "ended") {
    return value.status;
  }

  return value.endedAt ? "ended" : "active";
}

export function normalizeTrip(
  value: Partial<Trip> & Pick<Trip, "localId" | "deviceId" | "userId">,
): Trip {
  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    deviceId: value.deviceId,
    userId: value.userId,
    title: value.title ?? value.localId,
    description: value.description ?? null,
    recordingProfile: normalizeRecordingProfile(value.recordingProfile ?? DEFAULT_RECORDING_PROFILE),
    recordingConfig: value.recordingConfig ?? null,
    batteryStartLevelPercent: value.batteryStartLevelPercent ?? null,
    batteryStartState: value.batteryStartState ?? null,
    batteryEndLevelPercent: value.batteryEndLevelPercent ?? null,
    batteryEndState: value.batteryEndState ?? null,
    pointCount: value.pointCount ?? null,
    distanceMeters: value.distanceMeters ?? null,
    statsUpdatedAt: value.statsUpdatedAt ?? null,
    status: inferTripStatus(value),
    startedAt: value.startedAt ?? new Date(0).toISOString(),
    endedAt: value.endedAt ?? null,
    createdAt: value.createdAt ?? value.startedAt ?? new Date(0).toISOString(),
    updatedAt: value.updatedAt ?? value.startedAt ?? new Date(0).toISOString(),
    deletedAt: value.deletedAt ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}
