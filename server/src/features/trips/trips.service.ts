import type { SyncTripDto } from "./dto/sync-trip.dto";

export const tripsService = {
  syncTrip(payload: SyncTripDto) {
    return {
      accepted: true,
      tripLocalId: payload.localId,
      receivedPointCount: payload.points.length,
      receivedWaypointCount: payload.waypoints.length,
    };
  },
  listTrips() {
    return [];
  },
};
