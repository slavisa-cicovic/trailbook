import type { Trip, TripPoint, Waypoint } from "../domain/trips";
import type { AuthenticatedDeviceSession } from "../domain/identity";

export interface MobileDatabaseSchema {
  sessions: AuthenticatedDeviceSession[];
  trips: Trip[];
  tripPoints: TripPoint[];
  waypoints: Waypoint[];
}

export function createEmptyMobileDatabase(): MobileDatabaseSchema {
  return {
    sessions: [],
    trips: [],
    tripPoints: [],
    waypoints: [],
  };
}
