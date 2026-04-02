import type { Trip, Waypoint, WaypointAttachment } from "../../domain/trips";

export interface TripSummary {
  photoCount: number;
  trip: Trip;
  waypointCount: number;
}

export interface TripUpdateInput {
  description: string;
  title: string;
}

export interface WaypointUpdateInput {
  note: string;
  title: string;
}

export function getVisibleTrips(trips: Trip[]): Trip[] {
  return trips
    .filter((trip) => trip.deletedAt === null)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function getVisibleWaypointsForTrip(waypoints: Waypoint[], tripLocalId: string): Waypoint[] {
  return waypoints
    .filter((waypoint) => waypoint.tripLocalId === tripLocalId && waypoint.deletedAt === null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getVisibleAttachmentsForWaypoints(
  attachments: WaypointAttachment[],
  waypointLocalIds: string[],
): WaypointAttachment[] {
  const waypointIds = new Set(waypointLocalIds);

  return attachments.filter(
    (attachment) => waypointIds.has(attachment.waypointLocalId) && attachment.deletedAt === null,
  );
}

export function buildTripSummary(
  trip: Trip,
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
): TripSummary {
  const tripWaypoints = getVisibleWaypointsForTrip(waypoints, trip.localId);
  const tripAttachments = getVisibleAttachmentsForWaypoints(
    attachments,
    tripWaypoints.map((waypoint) => waypoint.localId),
  );

  return {
    trip,
    waypointCount: tripWaypoints.length,
    photoCount: tripAttachments.length,
  };
}

export function markTripDeleted(
  trips: Trip[],
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
  tripLocalId: string,
  deletedAt: string,
): {
  attachments: WaypointAttachment[];
  trips: Trip[];
  waypoints: Waypoint[];
} {
  const nextTrips = trips.map((trip) =>
    trip.localId === tripLocalId
      ? {
          ...trip,
          deletedAt,
          updatedAt: deletedAt,
          syncStatus: "pending-sync" as const,
        }
      : trip,
  );

  const tripWaypointIds = new Set(
    waypoints.filter((waypoint) => waypoint.tripLocalId === tripLocalId).map((waypoint) => waypoint.localId),
  );

  const nextWaypoints = waypoints.map((waypoint) =>
    waypoint.tripLocalId === tripLocalId
      ? {
          ...waypoint,
          deletedAt,
          updatedAt: deletedAt,
          syncStatus: "pending-sync" as const,
        }
      : waypoint,
  );

  const nextAttachments = attachments.map((attachment) =>
    tripWaypointIds.has(attachment.waypointLocalId)
      ? {
          ...attachment,
          deletedAt,
          updatedAt: deletedAt,
          syncStatus: "pending-sync" as const,
        }
      : attachment,
  );

  return {
    trips: nextTrips,
    waypoints: nextWaypoints,
    attachments: nextAttachments,
  };
}

export function restoreTripDeletedState(
  trips: Trip[],
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
  tripLocalId: string,
  restoredAt: string,
): {
  attachments: WaypointAttachment[];
  trips: Trip[];
  waypoints: Waypoint[];
} {
  const nextTrips = trips.map((trip) =>
    trip.localId === tripLocalId
      ? {
          ...trip,
          deletedAt: null,
          updatedAt: restoredAt,
          syncStatus: "pending-sync" as const,
        }
      : trip,
  );

  const tripWaypointIds = new Set(
    waypoints.filter((waypoint) => waypoint.tripLocalId === tripLocalId).map((waypoint) => waypoint.localId),
  );

  const nextWaypoints = waypoints.map((waypoint) =>
    waypoint.tripLocalId === tripLocalId
      ? {
          ...waypoint,
          deletedAt: null,
          updatedAt: restoredAt,
          syncStatus: "pending-sync" as const,
        }
      : waypoint,
  );

  const nextAttachments = attachments.map((attachment) =>
    tripWaypointIds.has(attachment.waypointLocalId)
      ? {
          ...attachment,
          deletedAt: null,
          updatedAt: restoredAt,
          syncStatus: "pending-sync" as const,
        }
      : attachment,
  );

  return {
    trips: nextTrips,
    waypoints: nextWaypoints,
    attachments: nextAttachments,
  };
}

export function updateTripMetadata(
  trips: Trip[],
  tripLocalId: string,
  input: TripUpdateInput,
  updatedAt: string,
): Trip[] {
  return trips.map((trip) =>
    trip.localId === tripLocalId
      ? {
          ...trip,
          title: input.title.trim(),
          description: input.description.trim() || null,
          updatedAt,
          syncStatus: "pending-sync" as const,
        }
      : trip,
  );
}

export function updateWaypointMetadata(
  waypoints: Waypoint[],
  waypointLocalId: string,
  input: WaypointUpdateInput,
  updatedAt: string,
): Waypoint[] {
  return waypoints.map((waypoint) =>
    waypoint.localId === waypointLocalId
      ? {
          ...waypoint,
          title: input.title.trim(),
          note: input.note.trim() || null,
          updatedAt,
          syncStatus: "pending-sync" as const,
        }
      : waypoint,
  );
}

export function markWaypointAttachmentDeleted(
  attachments: WaypointAttachment[],
  attachmentLocalId: string,
  deletedAt: string,
): WaypointAttachment[] {
  return attachments.map((attachment) =>
    attachment.localId === attachmentLocalId
      ? {
          ...attachment,
          deletedAt,
          updatedAt: deletedAt,
          syncStatus: "pending-sync" as const,
        }
      : attachment,
  );
}
