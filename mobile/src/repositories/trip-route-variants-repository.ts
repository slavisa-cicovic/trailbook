import type { TripRouteVariant } from "../domain/trip-route-variant";
import {
  loadTripRouteVariantSummaryRows,
  loadTripRouteVariantsForTrip,
  saveTripRouteVariants,
} from "../storage/trip-route-variants-storage";

export { loadTripRouteVariantsForTrip, saveTripRouteVariants };

export interface TripRouteVariantSummary {
  activeCount: number;
  deletedCount: number;
  providerCounts: Record<string, number>;
  tripCount: number;
  variantTypeCounts: Record<string, number>;
}

export async function loadTripRouteVariantSummary(): Promise<TripRouteVariantSummary> {
  const rows = await loadTripRouteVariantSummaryRows();
  const activeRows = rows.filter((row) => row.deletedAt === null);
  const providerCounts: Record<string, number> = {};
  const variantTypeCounts: Record<string, number> = {};

  for (const row of activeRows) {
    providerCounts[row.provider] = (providerCounts[row.provider] ?? 0) + 1;
    variantTypeCounts[row.variantType] = (variantTypeCounts[row.variantType] ?? 0) + 1;
  }

  return {
    activeCount: activeRows.length,
    deletedCount: rows.length - activeRows.length,
    providerCounts,
    tripCount: new Set(activeRows.map((row) => row.tripLocalId)).size,
    variantTypeCounts,
  };
}

// Re-export domain type for callers that need it
export type { TripRouteVariant };
