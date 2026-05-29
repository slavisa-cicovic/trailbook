import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { Trip, TripGroup, TripGroupMember } from "../../domain/trips";

export interface TripGroupSummary {
  description: string | null;
  group: TripGroup;
  lastTripStartedAt: string | null;
  totalDistanceMeters: number;
  totalDurationMs: number;
  tripCount: number;
}

export function getVisibleTripGroups(groups: TripGroup[]): TripGroup[] {
  return groups.filter((group) => group.deletedAt === null);
}

export function getVisibleTripGroupMembers(members: TripGroupMember[]): TripGroupMember[] {
  return members.filter((member) => member.deletedAt === null);
}

export function createTripGroup(
  identitySession: AuthenticatedDeviceSession,
  input: {
    description: string | null;
    title: string;
  },
  createdAt = new Date().toISOString(),
): TripGroup {
  return {
    localId: `trip-group-${createdAt}`,
    serverId: null,
    deviceId: identitySession.deviceId,
    userId: identitySession.userId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    syncStatus: "pending-sync",
  };
}

export function buildTripGroupMembersForTrips(
  identitySession: AuthenticatedDeviceSession,
  input: {
    existingMembers: TripGroupMember[];
    groupLocalId: string;
    tripLocalIds: string[];
  },
  createdAt = new Date().toISOString(),
): TripGroupMember[] {
  const existingActiveTripIds = new Set(
    input.existingMembers
      .filter((member) => member.groupLocalId === input.groupLocalId && member.deletedAt === null)
      .map((member) => member.tripLocalId),
  );
  const existingGroupMembers = input.existingMembers.filter(
    (member) => member.groupLocalId === input.groupLocalId,
  );
  const nextSortOrder = existingGroupMembers.reduce(
    (maxSortOrder, member) => Math.max(maxSortOrder, member.sortOrder),
    -1,
  ) + 1;

  return input.tripLocalIds
    .filter((tripLocalId) => !existingActiveTripIds.has(tripLocalId))
    .map((tripLocalId, index) => ({
      localId: `trip-group-member-${input.groupLocalId}-${tripLocalId}-${createdAt}`,
      serverId: null,
      groupLocalId: input.groupLocalId,
      tripLocalId,
      deviceId: identitySession.deviceId,
      userId: identitySession.userId,
      sortOrder: nextSortOrder + index,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
      syncStatus: "pending-sync" as const,
    }));
}

export function buildTripGroupSummaries(
  groups: TripGroup[],
  members: TripGroupMember[],
  trips: Trip[],
): TripGroupSummary[] {
  const visibleMembers = getVisibleTripGroupMembers(members);
  const visibleTripByLocalId = new Map(
    trips.filter((trip) => trip.deletedAt === null).map((trip) => [trip.localId, trip]),
  );

  return getVisibleTripGroups(groups).map((group) => {
    const groupTrips = visibleMembers
      .filter((member) => member.groupLocalId === group.localId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((member) => visibleTripByLocalId.get(member.tripLocalId))
      .filter((trip): trip is Trip => trip !== undefined);

    return {
      group,
      description: group.description,
      lastTripStartedAt: groupTrips.reduce<string | null>(
        (latest, trip) => (!latest || trip.startedAt > latest ? trip.startedAt : latest),
        null,
      ),
      totalDistanceMeters: groupTrips.reduce((total, trip) => total + (trip.distanceMeters ?? 0), 0),
      totalDurationMs: groupTrips.reduce((total, trip) => {
        if (!trip.endedAt) {
          return total;
        }

        return total + Math.max(0, new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime());
      }, 0),
      tripCount: groupTrips.length,
    };
  });
}
