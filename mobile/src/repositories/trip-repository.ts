import type { TripPoint } from "../domain/trips";
import {
  loadTripPointsForTrip,
  loadTripStatsByTripLocalIds,
} from "../storage/trip-points-storage";

export interface TripSummaryStats {
  distanceMeters: number;
  pointCount: number;
  statsUpdatedAt: string;
  tripLocalId: string;
}

export interface TripRouteDetail {
  points: TripPoint[];
  tripLocalId: string;
}

export async function listTripSummaryStats(
  tripLocalIds: string[],
): Promise<Map<string, TripSummaryStats>> {
  if (tripLocalIds.length === 0) {
    return new Map();
  }

  const rows = await loadTripStatsByTripLocalIds(tripLocalIds);
  const statsByTripLocalId = new Map<string, TripSummaryStats>();

  for (const [tripLocalId, row] of rows.entries()) {
    statsByTripLocalId.set(tripLocalId, {
      distanceMeters: row.distance_meters,
      pointCount: row.point_count,
      statsUpdatedAt: row.updated_at,
      tripLocalId,
    });
  }

  return statsByTripLocalId;
}

export async function getTripRouteDetail(tripLocalId: string): Promise<TripRouteDetail> {
  return {
    points: await loadTripPointsForTrip(tripLocalId),
    tripLocalId,
  };
}
