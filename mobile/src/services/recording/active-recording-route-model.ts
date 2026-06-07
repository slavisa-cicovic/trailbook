import type { RecordingSessionSummary, Trip, TripPoint, TripSegment } from "../../domain/trips";
import { getVisibleTripPointsForTrip } from "../trip-points/trip-points.service";

export interface ActiveRecordingRouteModel {
  activeTrip: Trip | null;
  activeTripPoints: TripPoint[];
  activeTripSegments: TripSegment[];
  lastPointRecordedAt: string | null;
  session: RecordingSessionSummary;
}

export function buildActiveRecordingRouteModel(input: {
  recordingSession: RecordingSessionSummary;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  trips: Trip[];
}): ActiveRecordingRouteModel {
  const activeTrip =
    input.trips.find(
      (trip) => trip.localId === input.recordingSession.activeTripId && trip.status === "active",
    ) ?? null;
  const activeTripPoints = activeTrip ? getVisibleTripPointsForTrip(input.tripPoints, activeTrip.localId) : [];
  const activeTripSegments = activeTrip
    ? input.tripSegments.filter((segment) => segment.tripLocalId === activeTrip.localId)
    : [];

  return {
    activeTrip,
    activeTripPoints,
    activeTripSegments,
    lastPointRecordedAt: input.recordingSession.lastPointRecordedAt ?? null,
    session: input.recordingSession,
  };
}
