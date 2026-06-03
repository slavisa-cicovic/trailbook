import type { RawLocationEventProcessingResult } from "../../domain/raw-location-event";
import type { Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import { updateRawLocationEventProcessingResults } from "../../repositories/raw-location-events-repository";
import { replaceTripPointsForTrip } from "../../repositories/trip-points-repository";
import { loadTripSegments, saveTripSegments } from "../../repositories/trip-segments-repository";
import { loadTrips, saveTrips } from "../../repositories/trips-repository";
import { loadWaypoints, saveWaypoints } from "../../repositories/waypoints-repository";

export interface RawEventReprocessingUnitOfWorkInput {
  distanceMeters: number;
  pointCount: number;
  processingResults: RawLocationEventProcessingResult[];
  trip: Trip;
  tripLocalId: string;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
}

function getNextSyncStatus<T extends { syncStatus: "local-only" | "pending-sync" | "synced" | "sync-error" }>(
  entity: T,
): T["syncStatus"] {
  return entity.syncStatus === "local-only" ? "local-only" : "pending-sync";
}

export async function applyRawEventReprocessingUnitOfWork(
  input: RawEventReprocessingUnitOfWorkInput,
): Promise<void> {
  const [trips, allTripSegments, allWaypoints] = await Promise.all([
    loadTrips(),
    loadTripSegments(),
    loadWaypoints(),
  ]);
  const updatedAt = new Date().toISOString();
  const nextTrip: Trip = {
    ...input.trip,
    distanceMeters: input.distanceMeters,
    pointCount: input.pointCount,
    statsUpdatedAt: updatedAt,
    syncStatus: getNextSyncStatus(input.trip),
    updatedAt,
  };

  await saveTrips(trips.map((trip) => (trip.localId === input.tripLocalId ? nextTrip : trip)));
  await saveTripSegments(
    [
      ...allTripSegments.filter((segment) => segment.tripLocalId !== input.tripLocalId),
      ...input.tripSegments,
    ],
    allTripSegments,
  );
  await replaceTripPointsForTrip(input.tripLocalId, input.tripPoints);
  await saveWaypoints(input.waypoints, allWaypoints);
  await updateRawLocationEventProcessingResults(input.processingResults);
}
