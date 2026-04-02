import type { CurrentLocationSnapshot } from "../location/location.service";
import type { Trip, Waypoint } from "../../domain/trips";

export interface WaypointDraftInput {
  note: string;
  title: string;
}

export function createWaypointForTrip(
  trip: Trip,
  location: CurrentLocationSnapshot,
  draft: WaypointDraftInput,
  createdAt: string,
): Waypoint {
  return {
    localId: `waypoint-${createdAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    latitude: location.latitude,
    longitude: location.longitude,
    title: draft.title.trim(),
    note: draft.note.trim() || null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    syncStatus: "local-only",
  };
}
