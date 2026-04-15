import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { OwnedServerTripDetail } from "../../domain/server-trips";
import type { Trip, TripPoint, TripSegment, Waypoint, WaypointAttachment } from "../../domain/trips";
import { buildTripAttachmentContentUrl, getOwnedTripFromServer, listOwnedTripsFromServer } from "./server-trip-sharing.service";

export interface RestoreTripsResult {
  importedCount: number;
  nextAttachments: WaypointAttachment[];
  nextTripPoints: TripPoint[];
  nextTripSegments: TripSegment[];
  nextTrips: Trip[];
  nextWaypoints: Waypoint[];
  skippedCount: number;
}

function importTripDetail(
  detail: OwnedServerTripDetail,
  identitySession: AuthenticatedDeviceSession,
): {
  attachments: WaypointAttachment[];
  trip: Trip;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
} {
  const segmentLocalIdByServerId = new Map(detail.segments.map((segment) => [segment.id, segment.localId]));
  const waypointLocalIdByServerId = new Map(detail.waypoints.map((waypoint) => [waypoint.id, waypoint.localId]));

  const trip: Trip = {
    localId: detail.localId,
    serverId: detail.id,
    deviceId: identitySession.deviceId,
    userId: identitySession.userId,
    title: detail.title,
    description: detail.description,
    recordingProfile: detail.recordingProfile,
    status: detail.endedAt ? "ended" : "paused",
    startedAt: detail.startedAt,
    endedAt: detail.endedAt,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    deletedAt: detail.deletedAt,
    syncStatus: "synced",
  };

  const tripSegments: TripSegment[] = detail.segments.map((segment) => ({
    localId: segment.localId,
    serverId: segment.id,
    tripLocalId: detail.localId,
    deviceId: identitySession.deviceId,
    userId: identitySession.userId,
    recordingProfile: segment.recordingProfile,
    startedAt: segment.startedAt,
    endedAt: segment.endedAt,
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
    syncStatus: "synced",
  }));

  const tripPoints: TripPoint[] = detail.points.map((point) => ({
    localId: point.localId,
    serverId: point.id,
    tripLocalId: detail.localId,
    segmentLocalId: point.segmentId ? (segmentLocalIdByServerId.get(point.segmentId) ?? null) : null,
    deviceId: identitySession.deviceId,
    userId: identitySession.userId,
    latitude: point.latitude,
    longitude: point.longitude,
    recordedAt: point.recordedAt,
    accuracy: point.accuracy,
    altitude: point.altitude,
    speed: point.speed,
    syncStatus: "synced",
  }));

  const waypoints: Waypoint[] = detail.waypoints.map((waypoint) => ({
    localId: waypoint.localId,
    serverId: waypoint.id,
    tripLocalId: detail.localId,
    segmentLocalId: waypoint.segmentId ? (segmentLocalIdByServerId.get(waypoint.segmentId) ?? null) : null,
    deviceId: identitySession.deviceId,
    userId: identitySession.userId,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    category: waypoint.category,
    title: waypoint.title,
    note: waypoint.note,
    createdAt: waypoint.createdAt,
    updatedAt: waypoint.updatedAt,
    deletedAt: null,
    syncStatus: "synced",
  }));

  const attachments = detail.attachments.reduce<WaypointAttachment[]>((result, attachment) => {
      const waypointLocalId = waypointLocalIdByServerId.get(attachment.waypointId) ?? attachment.waypointLocalId;

      if (!waypointLocalId) {
        return result;
      }

      result.push({
        localId: attachment.localId,
        serverId: attachment.id,
        waypointLocalId,
        deviceId: identitySession.deviceId,
        userId: identitySession.userId,
        type: "photo" as const,
        localUri: buildTripAttachmentContentUrl(identitySession.sessionToken ?? "", attachment.id),
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSizeBytes,
        createdAt: attachment.createdAt,
        updatedAt: attachment.updatedAt,
        deletedAt: null,
        syncStatus: "synced" as const,
      });

      return result;
    }, []);

  return {
    trip,
    tripSegments,
    tripPoints,
    waypoints,
    attachments,
  };
}

export async function restoreOwnedTripsFromServer(
  identitySession: AuthenticatedDeviceSession,
  currentState: {
    attachments: WaypointAttachment[];
    tripPoints: TripPoint[];
    tripSegments: TripSegment[];
    trips: Trip[];
    waypoints: Waypoint[];
  },
): Promise<RestoreTripsResult> {
  if (!identitySession.sessionToken) {
    throw new Error("Authenticated session token is required.");
  }

  const ownedTripsResponse = await listOwnedTripsFromServer(identitySession.sessionToken);
  const existingServerTripIds = new Set(
    currentState.trips
      .filter((trip) => trip.userId === identitySession.userId && trip.serverId !== null)
      .map((trip) => trip.serverId as string),
  );

  let nextTrips = currentState.trips;
  let nextTripSegments = currentState.tripSegments;
  let nextTripPoints = currentState.tripPoints;
  let nextWaypoints = currentState.waypoints;
  let nextAttachments = currentState.attachments;
  let importedCount = 0;
  let skippedCount = 0;

  for (const ownedTrip of ownedTripsResponse.trips) {
    if (existingServerTripIds.has(ownedTrip.id)) {
      skippedCount += 1;
      continue;
    }

    const detailResponse = await getOwnedTripFromServer(identitySession.sessionToken, ownedTrip.id);
    const imported = importTripDetail(detailResponse.trip, identitySession);

    nextTrips = [...nextTrips, imported.trip];
    nextTripSegments = [...nextTripSegments, ...imported.tripSegments];
    nextTripPoints = [...nextTripPoints, ...imported.tripPoints];
    nextWaypoints = [...nextWaypoints, ...imported.waypoints];
    nextAttachments = [...nextAttachments, ...imported.attachments];
    existingServerTripIds.add(ownedTrip.id);
    importedCount += 1;
  }

  return {
    importedCount,
    skippedCount,
    nextTrips,
    nextTripSegments,
    nextTripPoints,
    nextWaypoints,
    nextAttachments,
  };
}
