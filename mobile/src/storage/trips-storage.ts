import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_RECORDING_PROFILE, normalizeRecordingProfile } from "../constants/recording-profiles";
import { STORAGE_KEYS } from "../constants/storage-keys";
import type { Trip, TripStatus } from "../domain/trips";

function inferTripStatus(value: Partial<Trip>): TripStatus {
  if (value.status === "active" || value.status === "paused" || value.status === "ended") {
    return value.status;
  }

  return value.endedAt ? "ended" : "active";
}

function normalizeTrip(value: Partial<Trip> & Pick<Trip, "localId" | "deviceId" | "userId">): Trip {
  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    deviceId: value.deviceId,
    userId: value.userId,
    title: value.title ?? value.localId,
    description: value.description ?? null,
    recordingProfile: normalizeRecordingProfile(value.recordingProfile ?? DEFAULT_RECORDING_PROFILE),
    status: inferTripStatus(value),
    startedAt: value.startedAt ?? new Date(0).toISOString(),
    endedAt: value.endedAt ?? null,
    createdAt: value.createdAt ?? value.startedAt ?? new Date(0).toISOString(),
    updatedAt: value.updatedAt ?? value.startedAt ?? new Date(0).toISOString(),
    deletedAt: value.deletedAt ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

export async function loadTrips(): Promise<Trip[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.trips);

  if (!rawValue) {
    return [];
  }

  return (JSON.parse(rawValue) as Array<Partial<Trip> & Pick<Trip, "localId" | "deviceId" | "userId">>).map(
    normalizeTrip,
  );
}

export async function saveTrips(trips: Trip[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.trips, JSON.stringify(trips));
}
