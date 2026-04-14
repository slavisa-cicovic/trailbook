import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { TripPause } from "../domain/trips";

function normalizeTripPause(
  value: Partial<TripPause> & Pick<TripPause, "localId" | "tripLocalId" | "deviceId" | "userId">,
): TripPause {
  const fallbackDate = new Date(0).toISOString();

  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    deviceId: value.deviceId,
    userId: value.userId,
    startedAt: value.startedAt ?? fallbackDate,
    endedAt: value.endedAt ?? null,
    createdAt: value.createdAt ?? value.startedAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.startedAt ?? fallbackDate,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

export async function loadTripPauses(): Promise<TripPause[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripPauses);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as Array<
      Partial<TripPause> & Pick<TripPause, "localId" | "tripLocalId" | "deviceId" | "userId">
    >
  ).map(normalizeTripPause);
}

export async function saveTripPauses(tripPauses: TripPause[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.tripPauses, JSON.stringify(tripPauses));
}
