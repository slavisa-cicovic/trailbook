import type { Trip, TripPoint, Waypoint, WaypointAttachment } from "../domain/trips";

export {
  loadWaypoints,
  saveWaypoints,
} from "../storage/waypoints-storage";

export interface WaypointNavigation {
  nextWaypointLocalId: string | null;
  previousWaypointLocalId: string | null;
}

export interface WaypointScreenModel {
  attachments: WaypointAttachment[];
  navigation: WaypointNavigation;
  trip: Trip;
  waypoint: Waypoint;
  waypointOrder: Waypoint[];
}

export interface WaypointPhotoGroup {
  attachmentLocalId: string;
  title: string;
  waypointLocalId: string;
}

export interface WaypointPhotoViewerModel extends WaypointScreenModel {
  nextPhotoWaypoint: WaypointPhotoGroup | null;
  previousPhotoWaypoint: WaypointPhotoGroup | null;
  routeCoordinates: { latitude: number; longitude: number }[];
  selectedAttachment: WaypointAttachment | null;
  waypointCoordinate: { latitude: number; longitude: number };
}

function filterCurrentUserRows<T extends { userId: string }>(rows: T[], userId: string | null | undefined): T[] {
  if (!userId) {
    return rows;
  }

  return rows.filter((row) => row.userId === userId);
}

function getVisibleWaypointOrder(waypoints: Waypoint[], tripLocalId: string): Waypoint[] {
  return waypoints
    .filter((waypoint) => waypoint.tripLocalId === tripLocalId && waypoint.deletedAt === null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.localId.localeCompare(right.localId));
}

function getVisibleAttachmentsForWaypoint(
  attachments: WaypointAttachment[],
  waypointLocalId: string,
): WaypointAttachment[] {
  return attachments
    .filter((attachment) => attachment.waypointLocalId === waypointLocalId && attachment.deletedAt === null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.localId.localeCompare(right.localId));
}

function getWaypointNavigation(waypointLocalId: string, waypointOrder: Waypoint[]): WaypointNavigation {
  const waypointIndex = waypointOrder.findIndex((waypoint) => waypoint.localId === waypointLocalId);

  if (waypointIndex === -1) {
    return {
      nextWaypointLocalId: null,
      previousWaypointLocalId: null,
    };
  }

  return {
    nextWaypointLocalId: waypointOrder[waypointIndex + 1]?.localId ?? null,
    previousWaypointLocalId: waypointOrder[waypointIndex - 1]?.localId ?? null,
  };
}

function getWaypointPhotoGroup(
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
  boundary: "first" | "last",
): WaypointPhotoGroup | null {
  for (const waypoint of waypoints) {
    const waypointPhotos = getVisibleAttachmentsForWaypoint(attachments, waypoint.localId);
    const attachment = boundary === "first" ? waypointPhotos[0] : waypointPhotos[waypointPhotos.length - 1];

    if (attachment) {
      return {
        attachmentLocalId: attachment.localId,
        title: waypoint.title,
        waypointLocalId: waypoint.localId,
      };
    }
  }

  return null;
}

export async function getWaypointScreenModel(input: {
  tripLocalId: string;
  userId?: string | null;
  waypointLocalId: string;
}): Promise<WaypointScreenModel | null> {
  const [
    { loadTrips },
    { loadWaypointAttachments },
    { loadWaypoints },
  ] = await Promise.all([
    import("../storage/trips-storage"),
    import("../storage/waypoint-attachments-storage"),
    import("../storage/waypoints-storage"),
  ]);
  const [trips, waypoints, waypointAttachments] = await Promise.all([
    loadTrips(),
    loadWaypoints(),
    loadWaypointAttachments(),
  ]);
  const trip =
    filterCurrentUserRows(trips, input.userId).find(
      (candidate) => candidate.localId === input.tripLocalId && candidate.deletedAt === null,
    ) ?? null;

  if (!trip) {
    return null;
  }

  const waypointOrder = getVisibleWaypointOrder(filterCurrentUserRows(waypoints, input.userId), input.tripLocalId);
  const waypoint = waypointOrder.find((candidate) => candidate.localId === input.waypointLocalId) ?? null;

  if (!waypoint) {
    return null;
  }

  return {
    attachments: getVisibleAttachmentsForWaypoint(
      filterCurrentUserRows(waypointAttachments, input.userId),
      waypoint.localId,
    ),
    navigation: getWaypointNavigation(waypoint.localId, waypointOrder),
    trip,
    waypoint,
    waypointOrder,
  };
}

export async function getWaypointPhotoViewerModel(input: {
  selectedAttachmentLocalId: string | null;
  tripLocalId: string;
  userId?: string | null;
  waypointLocalId: string;
}): Promise<WaypointPhotoViewerModel | null> {
  const [
    { loadTripPointsForTrip },
    { loadWaypointAttachments },
  ] = await Promise.all([
    import("../storage/trip-points-storage"),
    import("../storage/waypoint-attachments-storage"),
  ]);
  const [waypointModel, routePoints, allWaypointAttachments] = await Promise.all([
    getWaypointScreenModel(input),
    loadTripPointsForTrip(input.tripLocalId),
    loadWaypointAttachments(),
  ]);

  if (!waypointModel) {
    return null;
  }

  const waypointIndex = waypointModel.waypointOrder.findIndex(
    (waypoint) => waypoint.localId === waypointModel.waypoint.localId,
  );
  const currentUserAttachments = filterCurrentUserRows(allWaypointAttachments, input.userId);

  return {
    ...waypointModel,
    nextPhotoWaypoint: getWaypointPhotoGroup(
      waypointModel.waypointOrder.slice(0, waypointIndex).reverse(),
      currentUserAttachments,
      "first",
    ),
    previousPhotoWaypoint: getWaypointPhotoGroup(
      waypointModel.waypointOrder.slice(waypointIndex + 1),
      currentUserAttachments,
      "last",
    ),
    routeCoordinates: routePoints.map((point: TripPoint) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    })),
    selectedAttachment:
      waypointModel.attachments.find((attachment) => attachment.localId === input.selectedAttachmentLocalId) ??
      null,
    waypointCoordinate: {
      latitude: waypointModel.waypoint.latitude,
      longitude: waypointModel.waypoint.longitude,
    },
  };
}
