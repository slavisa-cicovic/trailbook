import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { TripPoint } from "../domain/trips";

function normalizeTripPoint(
  value: Partial<TripPoint> & Pick<TripPoint, "localId" | "tripLocalId" | "deviceId" | "userId">,
): TripPoint {
  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    segmentLocalId: value.segmentLocalId ?? null,
    deviceId: value.deviceId,
    userId: value.userId,
    latitude: value.latitude ?? 0,
    longitude: value.longitude ?? 0,
    recordedAt: value.recordedAt ?? new Date(0).toISOString(),
    accuracy: value.accuracy ?? null,
    altitude: value.altitude ?? null,
    speed: value.speed ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

export async function loadTripPoints(): Promise<TripPoint[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripPoints);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as Array<
      Partial<TripPoint> & Pick<TripPoint, "localId" | "tripLocalId" | "deviceId" | "userId">
    >
  ).map(normalizeTripPoint);
}

export async function saveTripPoints(tripPoints: TripPoint[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.tripPoints, JSON.stringify(tripPoints));
}
