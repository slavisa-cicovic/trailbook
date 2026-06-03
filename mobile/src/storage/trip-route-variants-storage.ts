import type { TripRouteVariant } from "../domain/trip-route-variant";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

interface TripRouteVariantRow {
  created_at: string;
  deleted_at: string | null;
  geometry_json: string;
  local_id: string;
  provider: TripRouteVariant["provider"];
  server_id: string | null;
  trip_local_id: string;
  updated_at: string;
  variant_type: TripRouteVariant["variantType"];
}

export interface TripRouteVariantSummary {
  activeCount: number;
  deletedCount: number;
  providerCounts: Record<string, number>;
  tripCount: number;
  variantTypeCounts: Record<string, number>;
}

function toTripRouteVariantRow(variant: TripRouteVariant): TripRouteVariantRow {
  return {
    created_at: variant.createdAt,
    deleted_at: variant.deletedAt,
    geometry_json: JSON.stringify(variant.geometry),
    local_id: variant.localId,
    provider: variant.provider,
    server_id: variant.serverId,
    trip_local_id: variant.tripLocalId,
    updated_at: variant.updatedAt,
    variant_type: variant.variantType,
  };
}

function toTripRouteVariantFromRow(row: TripRouteVariantRow): TripRouteVariant {
  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    geometry: JSON.parse(row.geometry_json) as TripRouteVariant["geometry"],
    localId: row.local_id,
    provider: row.provider,
    serverId: row.server_id,
    tripLocalId: row.trip_local_id,
    updatedAt: row.updated_at,
    variantType: row.variant_type,
  };
}

export async function loadTripRouteVariantsForTrip(tripLocalId: string): Promise<TripRouteVariant[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<TripRouteVariantRow>(
    `SELECT *
     FROM trip_route_variants
     WHERE trip_local_id = ? AND deleted_at IS NULL
     ORDER BY created_at ASC, local_id ASC`,
    tripLocalId,
  );

  return rows.map(toTripRouteVariantFromRow);
}

export async function loadTripRouteVariantSummary(): Promise<TripRouteVariantSummary> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    deleted_at: string | null;
    provider: string;
    trip_local_id: string;
    variant_type: string;
  }>(
    `SELECT trip_local_id, variant_type, provider, deleted_at
     FROM trip_route_variants`,
  );

  const activeRows = rows.filter((row) => row.deleted_at === null);
  const providerCounts: Record<string, number> = {};
  const variantTypeCounts: Record<string, number> = {};

  for (const row of activeRows) {
    providerCounts[row.provider] = (providerCounts[row.provider] ?? 0) + 1;
    variantTypeCounts[row.variant_type] = (variantTypeCounts[row.variant_type] ?? 0) + 1;
  }

  return {
    activeCount: activeRows.length,
    deletedCount: rows.length - activeRows.length,
    providerCounts,
    tripCount: new Set(activeRows.map((row) => row.trip_local_id)).size,
    variantTypeCounts,
  };
}

export async function saveTripRouteVariants(variants: TripRouteVariant[]): Promise<void> {
  await runExclusiveDatabaseWrite(async (database) => {
    for (const variant of variants) {
      const row = toTripRouteVariantRow(variant);

      await database.runAsync(
        `INSERT OR REPLACE INTO trip_route_variants (
          local_id,
          server_id,
          trip_local_id,
          variant_type,
          provider,
          geometry_json,
          created_at,
          updated_at,
          deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.variant_type,
        row.provider,
        row.geometry_json,
        row.created_at,
        row.updated_at,
        row.deleted_at,
      );
    }
  });
}
