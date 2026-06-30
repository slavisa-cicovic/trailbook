export interface DisplayRoutePoint {
  tripId: string;
  index: number;
  timestamp: Date;
  latitude: number;
  longitude: number;
  speedMps?: number;
}
