import { getWaypointCategoryOption } from "../../constants/waypoint-categories";
import type { CurrentLocationSnapshot } from "../location/location.service";
import type { Trip, Waypoint, WaypointAttachment, WaypointCategory } from "../../domain/trips";
import type { PickedPhoto } from "../media/photo-picker.service";

export interface WaypointDraftInput {
  category: WaypointCategory;
  note: string;
  photos: PickedPhoto[];
  title: string;
}

export function createWaypointForTrip(
  trip: Trip,
  segmentLocalId: string | null,
  location: CurrentLocationSnapshot,
  draft: WaypointDraftInput,
  createdAt: string,
): Waypoint {
  return {
    localId: `waypoint-${createdAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    segmentLocalId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    latitude: location.latitude,
    longitude: location.longitude,
    category: draft.category,
    title: draft.title.trim(),
    note: draft.note.trim() || null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    syncStatus: "local-only",
  };
}

export function getSuggestedWaypointTitle(category: WaypointCategory): string {
  return getWaypointCategoryOption(category).label;
}

export function createPhotoAttachmentForWaypoint(
  waypoint: Waypoint,
  photo: PickedPhoto,
  createdAt: string,
): WaypointAttachment {
  return {
    localId: `waypoint-attachment-${createdAt}`,
    serverId: null,
    waypointLocalId: waypoint.localId,
    deviceId: waypoint.deviceId,
    userId: waypoint.userId,
    type: "photo",
    localUri: photo.localUri,
    mimeType: photo.mimeType,
    fileSize: photo.fileSize,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    syncStatus: "local-only",
  };
}
