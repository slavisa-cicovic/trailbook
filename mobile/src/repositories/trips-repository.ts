import type {
  Trip,
  TripGroup,
  TripGroupMember,
  TripPoint,
  TripSegment,
  Waypoint,
} from "../domain/trips";
import {
  loadTripSegmentStatsByTripLocalIds,
  loadTripStatsByTripLocalIds,
  loadTripPointsForTrip,
  type TripSegmentStatsRow,
} from "../storage/trip-points-storage";
import { loadTrips as loadTripsFromStorage, saveTrips } from "../storage/trips-storage";

export { saveTrips };
export const loadTrips = loadTripsFromStorage;

export interface TripSummaryStats {
  distanceMeters: number;
  pointCount: number;
  statsUpdatedAt: string;
  tripLocalId: string;
}

export interface TripRouteDetail {
  points: TripPoint[];
  tripLocalId: string;
}

export interface TripRouteNavigation {
  nextTripLocalId: string | null;
  previousTripLocalId: string | null;
}

export interface TripRouteScreenModel {
  navigation: TripRouteNavigation;
  segmentStatsBySegmentId: Map<string, TripSegmentStatsRow>;
  trip: Trip;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  tripStats: TripSummaryStats | null;
  waypoints: Waypoint[];
}

export interface TripsListItem {
  groupInfo: {
    groupCount: number;
    primaryGroupTitle: string | null;
  };
  stats: TripSummaryStats | null;
  trip: Trip;
}

function filterCurrentUserRows<T extends { userId: string }>(rows: T[], userId: string | null | undefined): T[] {
  if (!userId) {
    return rows;
  }

  return rows.filter((row) => row.userId === userId);
}

function getVisibleTripsForRepository(trips: Trip[]): Trip[] {
  return trips
    .filter((trip) => trip.deletedAt === null)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

function getVisibleGroupsForRepository(groups: TripGroup[]): TripGroup[] {
  return groups.filter((group) => group.deletedAt === null);
}

function getVisibleGroupMembersForRepository(members: TripGroupMember[]): TripGroupMember[] {
  return members.filter((member) => member.deletedAt === null);
}

function buildTripNavigationOrder(input: {
  groupLocalId: string | null | undefined;
  tripGroupMembers: TripGroupMember[];
  tripGroups: TripGroup[];
  trips: Trip[];
}): Trip[] {
  if (!input.groupLocalId) {
    return input.trips;
  }

  const selectedGroup = input.tripGroups.find((group) => group.localId === input.groupLocalId);

  if (!selectedGroup) {
    return input.trips;
  }

  const tripsByLocalId = new Map(input.trips.map((trip) => [trip.localId, trip]));

  return input.tripGroupMembers
    .filter((member) => member.groupLocalId === selectedGroup.localId)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((member) => tripsByLocalId.get(member.tripLocalId))
    .filter((trip): trip is Trip => trip !== undefined);
}

function getTripRouteNavigation(tripLocalId: string, navigationOrder: Trip[]): TripRouteNavigation {
  const selectedTripIndex = navigationOrder.findIndex((trip) => trip.localId === tripLocalId);

  if (selectedTripIndex === -1) {
    return {
      nextTripLocalId: null,
      previousTripLocalId: null,
    };
  }

  return {
    nextTripLocalId: navigationOrder[selectedTripIndex + 1]?.localId ?? null,
    previousTripLocalId: navigationOrder[selectedTripIndex - 1]?.localId ?? null,
  };
}

export async function listTripSummaryStats(
  tripLocalIds: string[],
): Promise<Map<string, TripSummaryStats>> {
  if (tripLocalIds.length === 0) {
    return new Map();
  }

  const rows = await loadTripStatsByTripLocalIds(tripLocalIds);
  const statsByTripLocalId = new Map<string, TripSummaryStats>();

  for (const [tripLocalId, row] of rows.entries()) {
    statsByTripLocalId.set(tripLocalId, {
      distanceMeters: row.distance_meters,
      pointCount: row.point_count,
      statsUpdatedAt: row.updated_at,
      tripLocalId,
    });
  }

  return statsByTripLocalId;
}

export async function getTripRouteDetail(tripLocalId: string): Promise<TripRouteDetail> {
  return {
    points: await loadTripPointsForTrip(tripLocalId),
    tripLocalId,
  };
}

export async function getTripRouteScreenModel(input: {
  groupLocalId?: string | null;
  tripLocalId: string;
  userId?: string | null;
}): Promise<TripRouteScreenModel | null> {
  const [
    { loadTripGroupMembers },
    { loadTripGroups },
    { loadTripSegments },
    { loadWaypoints },
  ] = await Promise.all([
    import("../storage/trip-group-members-storage"),
    import("../storage/trip-groups-storage"),
    import("../storage/trip-segments-storage"),
    import("../storage/waypoints-storage"),
  ]);
  const [
    allTrips,
    allTripGroups,
    allTripGroupMembers,
    allTripSegments,
    allWaypoints,
    tripPoints,
    tripStatsByTripLocalId,
    segmentStatsBySegmentId,
  ] = await Promise.all([
    loadTripsFromStorage(),
    loadTripGroups(),
    loadTripGroupMembers(),
    loadTripSegments(),
    loadWaypoints(),
    loadTripPointsForTrip(input.tripLocalId),
    listTripSummaryStats([input.tripLocalId]),
    loadTripSegmentStatsByTripLocalIds([input.tripLocalId]),
  ]);

  const visibleTrips = getVisibleTripsForRepository(filterCurrentUserRows(allTrips, input.userId));
  const trip = visibleTrips.find((candidate) => candidate.localId === input.tripLocalId);

  if (!trip) {
    return null;
  }

  const visibleTripGroups = getVisibleGroupsForRepository(filterCurrentUserRows(allTripGroups, input.userId));
  const visibleTripGroupMembers = getVisibleGroupMembersForRepository(
    filterCurrentUserRows(allTripGroupMembers, input.userId),
  );
  const navigationOrder = buildTripNavigationOrder({
    groupLocalId: input.groupLocalId,
    tripGroupMembers: visibleTripGroupMembers,
    tripGroups: visibleTripGroups,
    trips: visibleTrips,
  });
  const tripSegments = filterCurrentUserRows(allTripSegments, input.userId)
    .filter((segment) => segment.tripLocalId === input.tripLocalId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.localId.localeCompare(right.localId));
  const waypoints = filterCurrentUserRows(allWaypoints, input.userId)
    .filter((waypoint) => waypoint.tripLocalId === input.tripLocalId && waypoint.deletedAt === null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.localId.localeCompare(right.localId));

  return {
    navigation: getTripRouteNavigation(input.tripLocalId, navigationOrder),
    segmentStatsBySegmentId,
    trip,
    tripPoints,
    tripSegments,
    tripStats: tripStatsByTripLocalId.get(input.tripLocalId) ?? null,
    waypoints,
  };
}

export async function listTripsScreenItems(input: {
  tripLocalIds?: string[];
  userId?: string | null;
} = {}): Promise<TripsListItem[]> {
  const [
    { loadTripGroupMembers },
    { loadTripGroups },
  ] = await Promise.all([
    import("../storage/trip-group-members-storage"),
    import("../storage/trip-groups-storage"),
  ]);
  const [allTrips, allTripGroups, allTripGroupMembers] = await Promise.all([
    loadTripsFromStorage(),
    loadTripGroups(),
    loadTripGroupMembers(),
  ]);
  const requestedTripLocalIds = input.tripLocalIds ? new Set(input.tripLocalIds) : null;
  const visibleTrips = getVisibleTripsForRepository(filterCurrentUserRows(allTrips, input.userId)).filter((trip) =>
    requestedTripLocalIds ? requestedTripLocalIds.has(trip.localId) : true,
  );
  const statsByTripLocalId = await listTripSummaryStats(visibleTrips.map((trip) => trip.localId));
  const visibleTripGroups = getVisibleGroupsForRepository(filterCurrentUserRows(allTripGroups, input.userId));
  const visibleTripGroupMembers = getVisibleGroupMembersForRepository(
    filterCurrentUserRows(allTripGroupMembers, input.userId),
  );
  const groupByLocalId = new Map(visibleTripGroups.map((group) => [group.localId, group]));
  const groupsByTripLocalId = new Map<string, TripGroup[]>();

  for (const member of visibleTripGroupMembers) {
    const group = groupByLocalId.get(member.groupLocalId);

    if (!group) {
      continue;
    }

    const tripGroups = groupsByTripLocalId.get(member.tripLocalId) ?? [];
    tripGroups.push(group);
    groupsByTripLocalId.set(member.tripLocalId, tripGroups);
  }

  return visibleTrips.map((trip) => {
    const tripGroups = groupsByTripLocalId.get(trip.localId) ?? [];

    return {
      groupInfo: {
        groupCount: tripGroups.length,
        primaryGroupTitle: tripGroups[0]?.title ?? null,
      },
      stats: statsByTripLocalId.get(trip.localId) ?? null,
      trip,
    };
  });
}
