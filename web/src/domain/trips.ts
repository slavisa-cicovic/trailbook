export interface TripSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  distanceMeters: number;
  pointCount: number;
  waypointCount: number;
}

export const placeholderTrips: TripSummary[] = [
  {
    id: "trip-demo-001",
    startedAt: "2026-04-02T08:00:00.000Z",
    endedAt: "2026-04-02T08:45:00.000Z",
    distanceMeters: 12480,
    pointCount: 96,
    waypointCount: 3,
  },
];
