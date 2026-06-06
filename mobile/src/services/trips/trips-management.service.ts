import type {
  RecordingProfile,
  Trip,
  TripPoint,
  Waypoint,
  WaypointAttachment,
  WaypointCategory,
} from "../../domain/trips";
import {
  getVisibleTripPointsForTrip,
  groupVisibleTripPointsByTripId,
} from "../trip-points/trip-points.service";
import { calculateTripDistanceMeters } from "./trip-distance.service";

export interface TripSummary {
  distanceMeters: number;
  photoCount: number;
  trip: Trip;
  waypointCount: number;
}

export type TripDateFilter =
  | "all"
  | "today"
  | "yesterday"
  | "last_week"
  | "last_month"
  | "last_year";

export interface TripsAggregateSummary {
  bikeDistanceMeters: number;
  bikeDurationMs: number;
  bikeTripCount: number;
  boatDistanceMeters: number;
  boatDurationMs: number;
  boatTripCount: number;
  driveDistanceMeters: number;
  driveDurationMs: number;
  driveTripCount: number;
  planeDistanceMeters: number;
  planeDurationMs: number;
  planeTripCount: number;
  totalDistanceMeters: number;
  totalDurationMs: number;
  totalTripCount: number;
  walkDistanceMeters: number;
  walkDurationMs: number;
  walkTripCount: number;
}

export interface TripUpdateInput {
  description: string;
  title: string;
}

export interface WaypointUpdateInput {
  category: WaypointCategory;
  note: string;
  title: string;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isDriveProfile(profile: RecordingProfile): boolean {
  return profile === "drive";
}

function isBoatProfile(profile: RecordingProfile): boolean {
  return profile === "boat";
}

function isPlaneProfile(profile: RecordingProfile): boolean {
  return profile === "plane";
}

function getTripDurationMs(trip: Trip): number {
  const startedAt = new Date(trip.startedAt).getTime();
  const endedAt = new Date(trip.endedAt ?? new Date().toISOString()).getTime();

  if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
    return 0;
  }

  return endedAt - startedAt;
}

export function getVisibleTrips(trips: Trip[]): Trip[] {
  return trips
    .filter((trip) => trip.deletedAt === null)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function filterTripsByDate(
  trips: Trip[],
  filter: TripDateFilter,
  now: Date = new Date(),
): Trip[] {
  if (filter === "all") {
    return trips;
  }

  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(todayStart.getDate() + 1);

  if (filter === "today") {
    return trips.filter((trip) => {
      const tripDate = new Date(trip.startedAt);
      return tripDate >= todayStart && tripDate < tomorrowStart;
    });
  }

  if (filter === "yesterday") {
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    return trips.filter((trip) => {
      const tripDate = new Date(trip.startedAt);
      return tripDate >= yesterdayStart && tripDate < todayStart;
    });
  }

  const threshold = new Date(todayStart);

  if (filter === "last_week") {
    threshold.setDate(todayStart.getDate() - 7);
  } else if (filter === "last_month") {
    threshold.setMonth(todayStart.getMonth() - 1);
  } else {
    threshold.setFullYear(todayStart.getFullYear() - 1);
  }

  return trips.filter((trip) => new Date(trip.startedAt) >= threshold);
}

export function buildTripsAggregateSummary(trips: Trip[], tripPoints: TripPoint[]): TripsAggregateSummary {
  const tripPointsByTripId = groupVisibleTripPointsByTripId(tripPoints);

  return trips.reduce<TripsAggregateSummary>(
    (summary, trip) => {
      const durationMs = getTripDurationMs(trip);
      const isDrive = isDriveProfile(trip.recordingProfile);
      const isBoat = isBoatProfile(trip.recordingProfile);
      const isPlane = isPlaneProfile(trip.recordingProfile);
      const distanceMeters = trip.distanceMeters ?? calculateTripDistanceMeters(tripPointsByTripId.get(trip.localId) ?? []);

      summary.totalTripCount += 1;
      summary.totalDurationMs += durationMs;
      summary.totalDistanceMeters += distanceMeters;

      if (isDrive) {
        summary.driveTripCount += 1;
        summary.driveDurationMs += durationMs;
        summary.driveDistanceMeters += distanceMeters;
      } else if (isBoat) {
        summary.boatTripCount += 1;
        summary.boatDurationMs += durationMs;
        summary.boatDistanceMeters += distanceMeters;
      } else if (isPlane) {
        summary.planeTripCount += 1;
        summary.planeDurationMs += durationMs;
        summary.planeDistanceMeters += distanceMeters;
      } else if (trip.recordingProfile === "bike") {
        summary.bikeTripCount += 1;
        summary.bikeDurationMs += durationMs;
        summary.bikeDistanceMeters += distanceMeters;
      } else {
        summary.walkTripCount += 1;
        summary.walkDurationMs += durationMs;
        summary.walkDistanceMeters += distanceMeters;
      }

      return summary;
    },
    {
      bikeDistanceMeters: 0,
      bikeDurationMs: 0,
      bikeTripCount: 0,
      boatDistanceMeters: 0,
      boatDurationMs: 0,
      boatTripCount: 0,
      walkDistanceMeters: 0,
      walkDurationMs: 0,
      walkTripCount: 0,
      driveDistanceMeters: 0,
      driveDurationMs: 0,
      driveTripCount: 0,
      planeDistanceMeters: 0,
      planeDurationMs: 0,
      planeTripCount: 0,
      totalDistanceMeters: 0,
      totalDurationMs: 0,
      totalTripCount: 0,
    },
  );
}

export function formatDurationSummary(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
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
  tripPoints: TripPoint[],
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
): TripSummary {
  const orderedTripPoints = getVisibleTripPointsForTrip(tripPoints, trip.localId);
  const tripWaypoints = getVisibleWaypointsForTrip(waypoints, trip.localId);
  const tripAttachments = getVisibleAttachmentsForWaypoints(
    attachments,
    tripWaypoints.map((waypoint) => waypoint.localId),
  );

  return {
    distanceMeters: trip.distanceMeters ?? calculateTripDistanceMeters(orderedTripPoints),
    trip,
    waypointCount: tripWaypoints.length,
    photoCount: tripAttachments.length,
  };
}

export function buildTripSummaryWithPoints(
  trip: Trip,
  tripPoints: TripPoint[],
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
): TripSummary {
  const tripWaypoints = getVisibleWaypointsForTrip(waypoints, trip.localId);
  const tripAttachments = getVisibleAttachmentsForWaypoints(
    attachments,
    tripWaypoints.map((waypoint) => waypoint.localId),
  );

  return {
    distanceMeters: trip.distanceMeters ?? calculateTripDistanceMeters(tripPoints),
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
          category: input.category,
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

export function markWaypointDeleted(
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
  waypointLocalId: string,
  deletedAt: string,
): {
  attachments: WaypointAttachment[];
  waypoints: Waypoint[];
} {
  const nextWaypoints = waypoints.map((waypoint) =>
    waypoint.localId === waypointLocalId
      ? {
          ...waypoint,
          deletedAt,
          updatedAt: deletedAt,
          syncStatus: "pending-sync" as const,
        }
      : waypoint,
  );

  const nextAttachments = attachments.map((attachment) =>
    attachment.waypointLocalId === waypointLocalId
      ? {
          ...attachment,
          deletedAt,
          updatedAt: deletedAt,
          syncStatus: "pending-sync" as const,
        }
      : attachment,
  );

  return {
    waypoints: nextWaypoints,
    attachments: nextAttachments,
  };
}
