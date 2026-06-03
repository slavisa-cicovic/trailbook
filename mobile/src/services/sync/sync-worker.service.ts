import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { Trip, TripGroup, TripGroupMember, WaypointAttachment } from "../../domain/trips";
import { loadTripGroupMembers, saveTripGroupMembers } from "../../repositories/trip-group-members-repository";
import { loadTripGroups, saveTripGroups } from "../../repositories/trip-groups-repository";
import { loadTripPointsForTrip } from "../../repositories/trip-points-repository";
import { loadTripSegments } from "../../repositories/trip-segments-repository";
import { loadTrips, saveTrips } from "../../repositories/trips-repository";
import {
  enqueueSyncOutboxItem,
  loadPendingSyncOutboxItems,
  markSyncOutboxItemFailed,
  markSyncOutboxItemRunning,
  markSyncOutboxItemSucceeded,
  type SyncOutboxItem,
} from "../../repositories/sync-outbox-repository";
import { loadWaypointAttachments, saveWaypointAttachments } from "../../repositories/waypoint-attachments-repository";
import { loadWaypoints } from "../../repositories/waypoints-repository";
import {
  syncTripGroupsToServer,
  syncTripToServer,
  uploadTripAttachmentToServer,
} from "../trips/server-trip-sharing.service";

interface TripSyncPayload {
  tripLocalId: string;
}

interface TripGroupsSyncPayload {
  userId: string;
}

export interface SyncWorkerDrainResult {
  failed: number;
  processed: number;
  tripGroupMembers: TripGroupMember[] | null;
  tripGroups: TripGroup[] | null;
  trips: Trip[] | null;
  waypointAttachments: WaypointAttachment[] | null;
}

export async function enqueueTripSync(tripLocalId: string): Promise<void> {
  await enqueueSyncOutboxItem<TripSyncPayload>({
    entityLocalId: tripLocalId,
    entityType: "trip",
    operation: "trip_sync",
    payload: { tripLocalId },
  });
}

export async function enqueueTripGroupsSync(userId: string): Promise<void> {
  await enqueueSyncOutboxItem<TripGroupsSyncPayload>({
    entityLocalId: userId,
    entityType: "trip_groups",
    operation: "trip_groups_sync",
    payload: { userId },
  });
}

function requireSessionToken(identitySession: AuthenticatedDeviceSession): string {
  if (identitySession.mode !== "authenticated" || !identitySession.sessionToken) {
    throw new Error("Authenticated session is required for sync.");
  }

  return identitySession.sessionToken;
}

async function processTripSync(
  sessionToken: string,
  item: SyncOutboxItem<TripSyncPayload>,
): Promise<Pick<SyncWorkerDrainResult, "trips" | "waypointAttachments">> {
  const [trips, tripSegments, waypoints, waypointAttachments] = await Promise.all([
    loadTrips(),
    loadTripSegments(),
    loadWaypoints(),
    loadWaypointAttachments(),
  ]);
  const trip = trips.find((candidate) => candidate.localId === item.payload.tripLocalId);

  if (!trip) {
    throw new Error(`Trip ${item.payload.tripLocalId} was not found.`);
  }

  if (trip.status !== "ended") {
    throw new Error("Only ended trips can be synced.");
  }

  const tripWaypoints = waypoints.filter((waypoint) => waypoint.tripLocalId === trip.localId);
  const tripWaypointIds = new Set(tripWaypoints.map((waypoint) => waypoint.localId));
  const tripAttachments = waypointAttachments.filter((attachment) =>
    tripWaypointIds.has(attachment.waypointLocalId),
  );
  const response = await syncTripToServer(sessionToken, {
    attachments: tripAttachments,
    trip,
    tripPoints: await loadTripPointsForTrip(trip.localId),
    tripSegments: tripSegments.filter((segment) => segment.tripLocalId === trip.localId),
    waypoints: tripWaypoints,
  });
  const uploadedAttachments = [];
  const attachmentsToUpload = tripAttachments.filter(
    (attachment) =>
      attachment.deletedAt === null &&
      (!attachment.serverId || attachment.syncStatus !== "synced" || !attachment.localUri.startsWith("http")),
  );

  for (const attachment of attachmentsToUpload) {
    uploadedAttachments.push(
      await uploadTripAttachmentToServer(sessionToken, response.tripId, {
        attachmentLocalId: attachment.localId,
        localUri: attachment.localUri,
        mimeType: attachment.mimeType,
      }),
    );
  }

  const nextTrips = trips.map((candidate) =>
    candidate.localId === trip.localId
      ? {
          ...candidate,
          serverId: response.tripId,
          syncStatus: "synced" as const,
          updatedAt: response.syncedAt,
        }
      : candidate,
  );
  let nextAttachments = waypointAttachments;

  await saveTrips(nextTrips);

  if (uploadedAttachments.length > 0) {
    const uploadedAttachmentIds = new Map(
      uploadedAttachments.map((attachment) => [attachment.attachmentLocalId, attachment.attachmentId]),
    );

    nextAttachments = waypointAttachments.map((attachment) =>
      uploadedAttachmentIds.has(attachment.localId)
        ? {
            ...attachment,
            serverId: uploadedAttachmentIds.get(attachment.localId) ?? attachment.serverId,
            syncStatus: "synced" as const,
            updatedAt: response.syncedAt,
          }
        : attachment,
    );
    await saveWaypointAttachments(nextAttachments, waypointAttachments);
  }

  return { trips: nextTrips, waypointAttachments: nextAttachments };
}

async function processTripGroupsSync(
  sessionToken: string,
  item: SyncOutboxItem<TripGroupsSyncPayload>,
): Promise<Pick<SyncWorkerDrainResult, "tripGroupMembers" | "tripGroups">> {
  const [trips, groups, members] = await Promise.all([
    loadTrips(),
    loadTripGroups(),
    loadTripGroupMembers(),
  ]);
  const syncableTripLocalIds = new Set(
    trips
      .filter((trip) => trip.userId === item.payload.userId && trip.serverId)
      .map((trip) => trip.localId),
  );
  const groupsToSync = groups.filter((group) => group.userId === item.payload.userId);
  const membersToSync = members.filter(
    (member) => member.userId === item.payload.userId && syncableTripLocalIds.has(member.tripLocalId),
  );
  const response = await syncTripGroupsToServer(sessionToken, {
    groups: groupsToSync,
    members: membersToSync,
  });
  const groupIdByLocalId = new Map(response.groups.map((group) => [group.localId, group.groupId]));
  const memberIdByLocalId = new Map(response.members.map((member) => [member.localId, member.memberId]));
  const nextGroups = groups.map((group) =>
    group.userId === item.payload.userId && groupIdByLocalId.has(group.localId)
      ? {
          ...group,
          serverId: groupIdByLocalId.get(group.localId) ?? group.serverId,
          syncStatus: "synced" as const,
          updatedAt: response.syncedAt,
        }
      : group,
  );
  const nextMembers = members.map((member) =>
    member.userId === item.payload.userId && memberIdByLocalId.has(member.localId)
      ? {
          ...member,
          serverId: memberIdByLocalId.get(member.localId) ?? member.serverId,
          syncStatus: "synced" as const,
          updatedAt: response.syncedAt,
        }
      : member,
  );

  await Promise.all([saveTripGroups(nextGroups), saveTripGroupMembers(nextMembers)]);

  return { tripGroupMembers: nextMembers, tripGroups: nextGroups };
}

export async function drainSyncOutbox(
  identitySession: AuthenticatedDeviceSession,
  limit = 20,
): Promise<SyncWorkerDrainResult> {
  const sessionToken = requireSessionToken(identitySession);
  const items = await loadPendingSyncOutboxItems(limit);
  const result: SyncWorkerDrainResult = {
    failed: 0,
    processed: 0,
    tripGroupMembers: null,
    tripGroups: null,
    trips: null,
    waypointAttachments: null,
  };

  for (const item of items) {
    try {
      await markSyncOutboxItemRunning(item.id);

      if (item.operation === "trip_sync") {
        const nextState = await processTripSync(sessionToken, item as SyncOutboxItem<TripSyncPayload>);
        result.trips = nextState.trips;
        result.waypointAttachments = nextState.waypointAttachments;
      } else if (item.operation === "trip_groups_sync") {
        const nextState = await processTripGroupsSync(sessionToken, item as SyncOutboxItem<TripGroupsSyncPayload>);
        result.tripGroups = nextState.tripGroups;
        result.tripGroupMembers = nextState.tripGroupMembers;
      } else {
        throw new Error(`Unsupported sync operation: ${item.operation}`);
      }

      await markSyncOutboxItemSucceeded(item.id);
      result.processed += 1;
    } catch (error) {
      await markSyncOutboxItemFailed(item.id, error);
      result.failed += 1;
    }
  }

  return result;
}
