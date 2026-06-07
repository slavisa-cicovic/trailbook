import type {
  Trip,
  TripGroup,
  TripGroupMember,
  TripPause,
  TripPoint,
  TripSegment,
  Waypoint,
  WaypointAttachment,
} from "../domain/trips";
import {
  buildSegmentPolylines,
  buildTripSegmentsSummary,
  type SegmentPolyline,
  type TripSegmentSummary,
} from "../services/trip-segments/trip-segments.service";
import {
  buildTripTimelineEntries,
  type TripTimelineEntry,
} from "../services/trip-pauses/trip-pauses.service";
import type { TripSegmentStatsRow } from "../storage/trip-points-storage";

export async function loadTrips(): Promise<Trip[]> {
  const { loadTrips: loadTripsFromStorage } = await import("../storage/trips-storage");

  return loadTripsFromStorage();
}

export async function saveTrips(trips: Trip[]): Promise<void> {
  const { saveTrips: saveTripsToStorage } = await import("../storage/trips-storage");

  return saveTripsToStorage(trips);
}

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
  groupLocalId: string | null;
  nextTripLocalId: string | null;
  previousTripLocalId: string | null;
}

export interface TripRouteScreenModel {
  displayTripSegments: TripSegment[];
  fallbackCoordinates: MapCoordinate[];
  navigation: TripRouteNavigation;
  routeCoordinates: MapCoordinate[];
  selectedTripAttachments: WaypointAttachment[];
  selectedTripPauses: TripPause[];
  selectedTripSegments: TripSegmentSummary[];
  selectedTripTimeline: TripTimelineEntry[];
  selectedTripWaypoints: Waypoint[];
  segmentStatsBySegmentId: Map<string, TripSegmentStatsRow>;
  segmentPolylines: SegmentPolyline[];
  trip: Trip;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  tripStats: TripSummaryStats | null;
  waypointMarkers: TripRouteWaypointMarker[];
  waypoints: Waypoint[];
}

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface TripRouteWaypointMarker {
  firstPhotoUri: string | null;
  hasPhotos: boolean;
  waypoint: Waypoint;
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

function buildTripNavigationContext(input: {
  groupLocalId: string | null | undefined;
  tripGroupMembers: TripGroupMember[];
  tripGroups: TripGroup[];
  trips: Trip[];
}): { groupLocalId: string | null; navigationOrder: Trip[] } {
  if (!input.groupLocalId) {
    return {
      groupLocalId: null,
      navigationOrder: input.trips,
    };
  }

  const selectedGroup = input.tripGroups.find((group) => group.localId === input.groupLocalId);

  if (!selectedGroup) {
    return {
      groupLocalId: null,
      navigationOrder: input.trips,
    };
  }

  const tripsByLocalId = new Map(input.trips.map((trip) => [trip.localId, trip]));

  return {
    groupLocalId: selectedGroup.localId,
    navigationOrder: input.tripGroupMembers
      .filter((member) => member.groupLocalId === selectedGroup.localId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((member) => tripsByLocalId.get(member.tripLocalId))
      .filter((trip): trip is Trip => trip !== undefined),
  };
}

function getTripRouteNavigation(
  tripLocalId: string,
  navigationOrder: Trip[],
  groupLocalId: string | null,
): TripRouteNavigation {
  const selectedTripIndex = navigationOrder.findIndex((trip) => trip.localId === tripLocalId);

  if (selectedTripIndex === -1) {
    return {
      groupLocalId,
      nextTripLocalId: null,
      previousTripLocalId: null,
    };
  }

  return {
    groupLocalId,
    nextTripLocalId: navigationOrder[selectedTripIndex + 1]?.localId ?? null,
    previousTripLocalId: navigationOrder[selectedTripIndex - 1]?.localId ?? null,
  };
}

function getDisplayTripSegmentsForRepository(tripSegments: TripSegment[], trip: Trip): TripSegment[] {
  if (!trip.endedAt) {
    return tripSegments;
  }

  return tripSegments.map((segment) =>
    segment.tripLocalId === trip.localId && segment.endedAt === null
      ? {
          ...segment,
          endedAt: trip.endedAt,
        }
      : segment,
  );
}

function getVisibleAttachmentsForWaypoints(
  attachments: WaypointAttachment[],
  waypointLocalIds: string[],
): WaypointAttachment[] {
  const waypointLocalIdSet = new Set(waypointLocalIds);

  return attachments
    .filter((attachment) => attachment.deletedAt === null && waypointLocalIdSet.has(attachment.waypointLocalId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.localId.localeCompare(right.localId));
}

function buildWaypointMarkers(
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
): TripRouteWaypointMarker[] {
  const firstPhotoUriByWaypointId = new Map<string, string>();

  for (const attachment of attachments) {
    if (!firstPhotoUriByWaypointId.has(attachment.waypointLocalId)) {
      firstPhotoUriByWaypointId.set(attachment.waypointLocalId, attachment.localUri);
    }
  }

  return waypoints.map((waypoint) => ({
    firstPhotoUri: firstPhotoUriByWaypointId.get(waypoint.localId) ?? null,
    hasPhotos: firstPhotoUriByWaypointId.has(waypoint.localId),
    waypoint,
  }));
}

function mapTripPointsToCoordinates(tripPoints: TripPoint[]): MapCoordinate[] {
  return tripPoints.map((tripPoint) => ({
    latitude: tripPoint.latitude,
    longitude: tripPoint.longitude,
  }));
}

function mapWaypointsToCoordinates(waypoints: Waypoint[]): MapCoordinate[] {
  return waypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
  }));
}

export async function listTripSummaryStats(
  tripLocalIds: string[],
): Promise<Map<string, TripSummaryStats>> {
  if (tripLocalIds.length === 0) {
    return new Map();
  }

  const { loadTripStatsByTripLocalIds } = await import("../storage/trip-points-storage");
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
  const { loadTripPointsForTrip } = await import("../storage/trip-points-storage");

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
    { loadTripPauses },
    { loadTripPointsForTrip, loadTripSegmentStatsByTripLocalIds },
    { loadTripSegments },
    { loadWaypointAttachments },
    { loadWaypoints },
  ] = await Promise.all([
    import("../storage/trip-group-members-storage"),
    import("../storage/trip-groups-storage"),
    import("../storage/trip-pauses-storage"),
    import("../storage/trip-points-storage"),
    import("../storage/trip-segments-storage"),
    import("../storage/waypoint-attachments-storage"),
    import("../storage/waypoints-storage"),
  ]);
  const [
    allTrips,
    allTripGroups,
    allTripGroupMembers,
    allTripPauses,
    allTripSegments,
    allWaypointAttachments,
    allWaypoints,
    tripPoints,
    tripStatsByTripLocalId,
    segmentStatsBySegmentId,
  ] = await Promise.all([
    loadTrips(),
    loadTripGroups(),
    loadTripGroupMembers(),
    loadTripPauses(),
    loadTripSegments(),
    loadWaypointAttachments(),
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
  const navigationContext = buildTripNavigationContext({
    groupLocalId: input.groupLocalId,
    tripGroupMembers: visibleTripGroupMembers,
    tripGroups: visibleTripGroups,
    trips: visibleTrips,
  });
  const tripSegments = filterCurrentUserRows(allTripSegments, input.userId)
    .filter((segment) => segment.tripLocalId === input.tripLocalId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.localId.localeCompare(right.localId));
  const displayTripSegments = getDisplayTripSegmentsForRepository(tripSegments, trip);
  const selectedTripSegments = buildTripSegmentsSummary(
    displayTripSegments,
    tripPoints,
    input.tripLocalId,
    segmentStatsBySegmentId,
  );
  const selectedTripPauses = filterCurrentUserRows(allTripPauses, input.userId)
    .filter((tripPause) => tripPause.tripLocalId === input.tripLocalId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.localId.localeCompare(right.localId));
  const selectedTripTimeline = buildTripTimelineEntries(
    selectedTripSegments,
    selectedTripPauses,
    new Date().toISOString(),
  );
  const waypoints = filterCurrentUserRows(allWaypoints, input.userId)
    .filter((waypoint) => waypoint.tripLocalId === input.tripLocalId && waypoint.deletedAt === null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.localId.localeCompare(right.localId));
  const selectedTripAttachments = getVisibleAttachmentsForWaypoints(
    filterCurrentUserRows(allWaypointAttachments, input.userId),
    waypoints.map((waypoint) => waypoint.localId),
  );
  const routeCoordinates = mapTripPointsToCoordinates(tripPoints);
  const fallbackCoordinates = mapWaypointsToCoordinates(waypoints);

  return {
    displayTripSegments,
    fallbackCoordinates,
    navigation: getTripRouteNavigation(
      input.tripLocalId,
      navigationContext.navigationOrder,
      navigationContext.groupLocalId,
    ),
    routeCoordinates,
    selectedTripAttachments,
    selectedTripPauses,
    selectedTripSegments,
    selectedTripTimeline,
    selectedTripWaypoints: waypoints,
    segmentStatsBySegmentId,
    segmentPolylines: buildSegmentPolylines(displayTripSegments, tripPoints, input.tripLocalId),
    trip,
    tripPoints,
    tripSegments,
    tripStats: tripStatsByTripLocalId.get(input.tripLocalId) ?? null,
    waypointMarkers: buildWaypointMarkers(waypoints, selectedTripAttachments),
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
    loadTrips(),
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
