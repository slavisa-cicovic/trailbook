import type { Trip, TripPoint, Waypoint } from "../domain/trips";

export interface MobileDatabaseSchema {
  trips: Trip[];
  tripPoints: TripPoint[];
  waypoints: Waypoint[];
}

export function createEmptyMobileDatabase(): MobileDatabaseSchema {
  return {
    trips: [],
    tripPoints: [],
    waypoints: [],
  };
}
