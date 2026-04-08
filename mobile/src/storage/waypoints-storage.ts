import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { Waypoint } from "../domain/trips";

function normalizeWaypoint(
  value: Partial<Waypoint> & Pick<Waypoint, "localId" | "tripLocalId" | "deviceId" | "userId">,
): Waypoint {
  const fallbackDate = new Date(0).toISOString();

  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    segmentLocalId: value.segmentLocalId ?? null,
    deviceId: value.deviceId,
    userId: value.userId,
    latitude: value.latitude ?? 0,
    longitude: value.longitude ?? 0,
    title: value.title ?? value.localId,
    note: value.note ?? null,
    createdAt: value.createdAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.createdAt ?? fallbackDate,
    deletedAt: value.deletedAt ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

export async function loadWaypoints(): Promise<Waypoint[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.waypoints);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as Array<
      Partial<Waypoint> & Pick<Waypoint, "localId" | "tripLocalId" | "deviceId" | "userId">
    >
  ).map(normalizeWaypoint);
}

export async function saveWaypoints(waypoints: Waypoint[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.waypoints, JSON.stringify(waypoints));
}
