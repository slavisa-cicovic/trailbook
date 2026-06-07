import type { RawLocationEvent } from "../domain/raw-location-event";
import type { RecordingSessionSummary, Trip, TripPoint, TripSegment, Waypoint } from "../domain/trips";

export interface RawReprocessingInputModel {
  oldTripPoints: TripPoint[];
  rawEvents: RawLocationEvent[];
  recordingSession: RecordingSessionSummary | null;
  trip: Trip;
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
}

export async function loadRawReprocessingInputModel(tripLocalId: string): Promise<RawReprocessingInputModel | null> {
  const { loadTrips } = await import("../storage/trips-storage");
  const { loadTripSegments } = await import("../storage/trip-segments-storage");
  const { loadWaypoints } = await import("../storage/waypoints-storage");
  const { loadTripPointsForTrip } = await import("../storage/trip-points-storage");
  const { loadRawLocationEventsForTrip } = await import("../storage/raw-location-events-storage");
  const { loadRecordingSession } = await import("../storage/recording-storage");

  const [trips, allTripSegments, waypoints, oldTripPoints, rawEvents, recordingSession] = await Promise.all([
    loadTrips(),
    loadTripSegments(),
    loadWaypoints(),
    loadTripPointsForTrip(tripLocalId),
    loadRawLocationEventsForTrip(tripLocalId),
    loadRecordingSession(),
  ]);

  const trip = trips.find((candidate) => candidate.localId === tripLocalId && candidate.deletedAt === null) ?? null;

  if (!trip) {
    return null;
  }

  return {
    oldTripPoints,
    rawEvents,
    recordingSession,
    trip,
    tripSegments: allTripSegments.filter((segment) => segment.tripLocalId === tripLocalId),
    waypoints,
  };
}
