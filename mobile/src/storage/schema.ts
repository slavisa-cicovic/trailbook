import type { Trip, TripPause, TripPoint, TripSegment, Waypoint, WaypointAttachment } from "../domain/trips";
import type { AuthenticatedDeviceSession } from "../domain/identity";

export interface MobileDatabaseSchema {
  sessions: AuthenticatedDeviceSession[];
  trips: Trip[];
  tripPauses: TripPause[];
  tripSegments: TripSegment[];
  tripPoints: TripPoint[];
  waypoints: Waypoint[];
  waypointAttachments: WaypointAttachment[];
}

export function createEmptyMobileDatabase(): MobileDatabaseSchema {
  return {
    sessions: [],
    trips: [],
    tripPauses: [],
    tripSegments: [],
    tripPoints: [],
    waypoints: [],
    waypointAttachments: [],
  };
}
