import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_RECORDING_PROFILE } from "../constants/recording-profiles";
import { STORAGE_KEYS } from "../constants/storage-keys";
import type { TripSegment } from "../domain/trips";

function normalizeTripSegment(
  value: Partial<TripSegment> & Pick<TripSegment, "localId" | "tripLocalId" | "deviceId" | "userId">,
): TripSegment {
  const fallbackDate = new Date(0).toISOString();

  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    deviceId: value.deviceId,
    userId: value.userId,
    recordingProfile: value.recordingProfile ?? DEFAULT_RECORDING_PROFILE,
    startedAt: value.startedAt ?? fallbackDate,
    endedAt: value.endedAt ?? null,
    createdAt: value.createdAt ?? value.startedAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.startedAt ?? fallbackDate,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

export async function loadTripSegments(): Promise<TripSegment[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripSegments);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as Array<
      Partial<TripSegment> & Pick<TripSegment, "localId" | "tripLocalId" | "deviceId" | "userId">
    >
  ).map(normalizeTripSegment);
}

export async function saveTripSegments(tripSegments: TripSegment[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.tripSegments, JSON.stringify(tripSegments));
}
