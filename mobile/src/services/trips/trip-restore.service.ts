import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { RawLocationEvent } from "../../domain/raw-location-event";
import type { OwnedServerTripDetail } from "../../domain/server-trips";
import type {
  Trip,
  TripGroup,
  TripGroupMember,
  TripPoint,
  TripSegment,
  Waypoint,
  WaypointAttachment,
} from "../../domain/trips";
import { downloadPhotoToLocalStorage } from "../media/photo-picker.service";
import {
  buildTripAttachmentContentUrl,
  getOwnedTripFromServer,
  listOwnedTripsFromServer,
  listTripGroupsFromServer,
} from "./server-trip-sharing.service";

export interface RestoreTripsResult {
  importedCount: number;
  nextAttachments: WaypointAttachment[];
  nextTripGroupMembers: TripGroupMember[];
  nextTripGroups: TripGroup[];
  nextTripPoints: TripPoint[];
  restoredRawLocationEvents: RawLocationEvent[];
  nextTripSegments: TripSegment[];
  nextTrips: Trip[];
  nextWaypoints: Waypoint[];
  skippedCount: number;
}

async function importTripDetail(
  detail: OwnedServerTripDetail,
  identitySession: AuthenticatedDeviceSession,
): Promise<{
  attachments: WaypointAttachment[];
  trip: Trip;
  tripPoints: TripPoint[];
  rawLocationEvents: RawLocationEvent[];
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
}> {
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
    recordingConfig: detail.recordingConfig,
    batteryStartLevelPercent: detail.batteryStartLevelPercent,
    batteryStartState: detail.batteryStartState,
    batteryEndLevelPercent: detail.batteryEndLevelPercent,
    batteryEndState: detail.batteryEndState,
    pointCount: detail.pointCount,
    distanceMeters: detail.distanceMeters,
    statsUpdatedAt: detail.statsUpdatedAt,
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
    pointCount: segment.pointCount,
    distanceMeters: segment.distanceMeters,
    durationMs: segment.durationMs,
    statsUpdatedAt: segment.statsUpdatedAt,
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

  const rawLocationEvents: RawLocationEvent[] = (detail.rawEvents ?? []).map(({ id: _id, ...event }) => ({
    ...event,
    tripLocalId: detail.localId,
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

  const attachments: WaypointAttachment[] = [];

  for (const attachment of detail.attachments) {
    const waypointLocalId = waypointLocalIdByServerId.get(attachment.waypointId) ?? attachment.waypointLocalId;

    if (!waypointLocalId) {
      continue;
    }

    const downloadedPhoto = await downloadPhotoToLocalStorage({
      fileNameSeed: `server-${attachment.id}`,
      mimeType: attachment.mimeType,
      sourceUrl: buildTripAttachmentContentUrl(identitySession.sessionToken ?? "", attachment.id),
    });

    attachments.push({
      localId: attachment.localId,
      serverId: attachment.id,
      waypointLocalId,
      deviceId: identitySession.deviceId,
      userId: identitySession.userId,
      type: "photo" as const,
      localUri: downloadedPhoto.localUri,
      mimeType: attachment.mimeType,
      fileSize: downloadedPhoto.fileSize ?? attachment.fileSizeBytes,
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt,
      deletedAt: null,
      syncStatus: "synced" as const,
    });
  }

  return {
    trip,
    tripSegments,
    tripPoints,
    rawLocationEvents,
    waypoints,
    attachments,
  };
}

export async function restoreOwnedTripsFromServer(
  identitySession: AuthenticatedDeviceSession,
  currentState: {
    attachments: WaypointAttachment[];
    tripGroupMembers: TripGroupMember[];
    tripGroups: TripGroup[];
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
  let restoredRawLocationEvents: RawLocationEvent[] = [];
  let nextWaypoints = currentState.waypoints;
  let nextAttachments = currentState.attachments;
  let nextTripGroups = currentState.tripGroups;
  let nextTripGroupMembers = currentState.tripGroupMembers;
  let importedCount = 0;
  let skippedCount = 0;

  for (const ownedTrip of ownedTripsResponse.trips) {
    if (existingServerTripIds.has(ownedTrip.id)) {
      skippedCount += 1;
      continue;
    }

    const detailResponse = await getOwnedTripFromServer(identitySession.sessionToken, ownedTrip.id);
    const imported = await importTripDetail(detailResponse.trip, identitySession);

    nextTrips = [...nextTrips, imported.trip];
    nextTripSegments = [...nextTripSegments, ...imported.tripSegments];
    nextTripPoints = [...nextTripPoints, ...imported.tripPoints];
    restoredRawLocationEvents = [...restoredRawLocationEvents, ...imported.rawLocationEvents];
    nextWaypoints = [...nextWaypoints, ...imported.waypoints];
    nextAttachments = [...nextAttachments, ...imported.attachments];
    existingServerTripIds.add(ownedTrip.id);
    importedCount += 1;
  }

  const tripGroupsResponse = await listTripGroupsFromServer(identitySession.sessionToken);
  const restoredTripGroups: TripGroup[] = tripGroupsResponse.groups.map((group) => ({
    localId: group.localId,
    serverId: group.id,
    deviceId: identitySession.deviceId,
    userId: identitySession.userId,
    title: group.title,
    description: group.description,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    deletedAt: group.deletedAt,
    syncStatus: "synced",
  }));
  const restoredTripGroupLocalIds = new Set(restoredTripGroups.map((group) => group.localId));
  const restoredTripLocalIds = new Set(
    nextTrips
      .filter((trip) => trip.userId === identitySession.userId)
      .map((trip) => trip.localId),
  );
  const restoredTripGroupMembers: TripGroupMember[] = tripGroupsResponse.members
    .filter(
      (member) =>
        restoredTripGroupLocalIds.has(member.groupLocalId) && restoredTripLocalIds.has(member.tripLocalId),
    )
    .map((member) => ({
      localId: member.localId,
      serverId: member.id,
      groupLocalId: member.groupLocalId,
      tripLocalId: member.tripLocalId,
      deviceId: identitySession.deviceId,
      userId: identitySession.userId,
      sortOrder: member.sortOrder,
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
      deletedAt: member.deletedAt,
      syncStatus: "synced",
    }));

  nextTripGroups = [
    ...nextTripGroups.filter(
      (group) =>
        group.userId !== identitySession.userId ||
        !restoredTripGroupLocalIds.has(group.localId),
    ),
    ...restoredTripGroups,
  ];
  nextTripGroupMembers = [
    ...nextTripGroupMembers.filter(
      (member) =>
        member.userId !== identitySession.userId || !restoredTripGroupLocalIds.has(member.groupLocalId),
    ),
    ...restoredTripGroupMembers,
  ];

  return {
    importedCount,
    skippedCount,
    nextTrips,
    nextTripSegments,
    nextTripPoints,
    restoredRawLocationEvents,
    nextTripGroups,
    nextTripGroupMembers,
    nextWaypoints,
    nextAttachments,
  };
}
