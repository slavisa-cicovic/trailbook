import { DEFAULT_WAYPOINT_CATEGORY, normalizeWaypointCategory } from "../constants/waypoint-categories";
import type { Waypoint } from "./trips";

export function normalizeWaypoint(
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
    category: normalizeWaypointCategory(value.category ?? DEFAULT_WAYPOINT_CATEGORY),
    title: value.title ?? value.localId,
    note: value.note ?? null,
    createdAt: value.createdAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.createdAt ?? fallbackDate,
    deletedAt: value.deletedAt ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}
