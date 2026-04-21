import type { Trip, TripPause, TripPoint, TripSegment, Waypoint, WaypointAttachment } from "../domain/trips";
import type { AuthenticatedDeviceSession } from "../domain/identity";
import type { TripDiagnostics } from "../domain/trip-diagnostics";

export interface MobileDatabaseSchema {
  sessions: AuthenticatedDeviceSession[];
  trips: Trip[];
  tripPauses: TripPause[];
  tripSegments: TripSegment[];
  tripPoints: TripPoint[];
  tripDiagnostics: TripDiagnostics[];
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
    tripDiagnostics: [],
    waypoints: [],
    waypointAttachments: [],
  };
}
