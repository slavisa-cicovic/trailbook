import type { RawLocationEvent } from "../../domain/raw-location-event";
import type { SyncStatus, Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import { loadRawLocationEventsForTrip } from "../../repositories/raw-location-events-repository";
import { loadTripPointsForTrip } from "../../repositories/trip-points-repository";
import { loadTripSegments } from "../../repositories/trip-segments-repository";
import { loadTrips } from "../../repositories/trips-repository";
import { loadWaypoints } from "../../repositories/waypoints-repository";
import { loadJsonRecord, saveJsonRecord } from "../../storage/app-kv-storage";
import { restoreRawEventReprocessingSnapshotRows } from "../../storage/raw-event-reprocessing-undo-storage";

const SNAPSHOT_SCHEMA_VERSION = 1;

export interface RawEventReprocessingUndoSnapshot {
  createdAt: string;
  rawEvents: RawLocationEvent[];
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  trip: Trip;
  tripLocalId: string;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
}

function getSnapshotStorageKey(tripLocalId: string): string {
  return `raw-event-reprocessing-undo:${tripLocalId}`;
}

function getRestoredSyncStatus(syncStatus: SyncStatus): SyncStatus {
  return syncStatus === "local-only" ? "local-only" : "pending-sync";
}

function markTripRestoredForSync(trip: Trip, restoredAt: string): Trip {
  return {
    ...trip,
    syncStatus: getRestoredSyncStatus(trip.syncStatus),
    updatedAt: restoredAt,
  };
}

function markTripSegmentRestoredForSync(tripSegment: TripSegment, restoredAt: string): TripSegment {
  return {
    ...tripSegment,
    syncStatus: getRestoredSyncStatus(tripSegment.syncStatus),
    updatedAt: restoredAt,
  };
}

function markTripPointRestoredForSync(tripPoint: TripPoint): TripPoint {
  return {
    ...tripPoint,
    syncStatus: getRestoredSyncStatus(tripPoint.syncStatus),
  };
}

function markWaypointRestoredForSync(waypoint: Waypoint, restoredAt: string): Waypoint {
  return {
    ...waypoint,
    syncStatus: getRestoredSyncStatus(waypoint.syncStatus),
    updatedAt: restoredAt,
  };
}

export async function loadRawEventReprocessingUndoSnapshot(
  tripLocalId: string,
): Promise<RawEventReprocessingUndoSnapshot | null> {
  const snapshot = await loadJsonRecord<RawEventReprocessingUndoSnapshot>(getSnapshotStorageKey(tripLocalId));

  if (!snapshot || snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION || snapshot.tripLocalId !== tripLocalId) {
    return null;
  }

  return snapshot;
}

export async function hasRawEventReprocessingUndoSnapshot(tripLocalId: string): Promise<boolean> {
  return (await loadRawEventReprocessingUndoSnapshot(tripLocalId)) !== null;
}

export async function discardRawEventReprocessingUndoSnapshot(tripLocalId: string): Promise<void> {
  await saveJsonRecord(getSnapshotStorageKey(tripLocalId), null);
}

export async function saveRawEventReprocessingUndoSnapshotForTrip(
  tripLocalId: string,
): Promise<RawEventReprocessingUndoSnapshot> {
  const [trips, tripSegments, tripPoints, waypoints, rawEvents] = await Promise.all([
    loadTrips(),
    loadTripSegments(),
    loadTripPointsForTrip(tripLocalId),
    loadWaypoints(),
    loadRawLocationEventsForTrip(tripLocalId),
  ]);
  const trip = trips.find((candidate) => candidate.localId === tripLocalId) ?? null;

  if (!trip) {
    throw new Error("Trip was not found.");
  }

  const snapshot: RawEventReprocessingUndoSnapshot = {
    createdAt: new Date().toISOString(),
    rawEvents,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    trip,
    tripLocalId,
    tripPoints,
    tripSegments: tripSegments.filter((tripSegment) => tripSegment.tripLocalId === tripLocalId),
    waypoints: waypoints.filter((waypoint) => waypoint.tripLocalId === tripLocalId),
  };

  await saveJsonRecord(getSnapshotStorageKey(tripLocalId), snapshot);

  return snapshot;
}

export async function restoreRawEventReprocessingUndoSnapshot(tripLocalId: string): Promise<void> {
  const snapshot = await loadRawEventReprocessingUndoSnapshot(tripLocalId);

  if (!snapshot) {
    throw new Error("No raw reprocessing undo snapshot is available for this trip.");
  }

  const restoredAt = new Date().toISOString();
  const restoredTrip = markTripRestoredForSync(snapshot.trip, restoredAt);
  const restoredTripSegments = snapshot.tripSegments.map((tripSegment) =>
    markTripSegmentRestoredForSync(tripSegment, restoredAt),
  );
  const restoredTripPoints = snapshot.tripPoints.map(markTripPointRestoredForSync);
  const restoredWaypointsByLocalId = new Map(
    snapshot.waypoints.map((waypoint) => [
      waypoint.localId,
      markWaypointRestoredForSync(waypoint, restoredAt),
    ]),
  );

  await restoreRawEventReprocessingSnapshotRows({
    rawEvents: snapshot.rawEvents,
    trip: restoredTrip,
    tripLocalId,
    tripPoints: restoredTripPoints,
    tripSegments: restoredTripSegments,
    waypoints: Array.from(restoredWaypointsByLocalId.values()),
  });
  await discardRawEventReprocessingUndoSnapshot(tripLocalId);
}
