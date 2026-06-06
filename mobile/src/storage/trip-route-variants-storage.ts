import { and, asc, eq, isNull } from "drizzle-orm";

import type { TripRouteVariant } from "../domain/trip-route-variant";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { tripRouteVariants as tripRouteVariantsTable } from "./drizzle/schema";

type TripRouteVariantRow = typeof tripRouteVariantsTable.$inferSelect;
type TripRouteVariantInsert = typeof tripRouteVariantsTable.$inferInsert;

export interface TripRouteVariantSummary {
  activeCount: number;
  deletedCount: number;
  providerCounts: Record<string, number>;
  tripCount: number;
  variantTypeCounts: Record<string, number>;
}

function toTripRouteVariantRow(variant: TripRouteVariant): TripRouteVariantInsert {
  return {
    createdAt: variant.createdAt,
    deletedAt: variant.deletedAt,
    geometryJson: JSON.stringify(variant.geometry),
    localId: variant.localId,
    provider: variant.provider,
    serverId: variant.serverId,
    tripLocalId: variant.tripLocalId,
    updatedAt: variant.updatedAt,
    variantType: variant.variantType,
  };
}

function toTripRouteVariantFromRow(row: TripRouteVariantRow): TripRouteVariant {
  return {
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    geometry: JSON.parse(row.geometryJson) as TripRouteVariant["geometry"],
    localId: row.localId,
    provider: row.provider as TripRouteVariant["provider"],
    serverId: row.serverId,
    tripLocalId: row.tripLocalId,
    updatedAt: row.updatedAt,
    variantType: row.variantType as TripRouteVariant["variantType"],
  };
}

function toTripRouteVariantUpdate(
  row: TripRouteVariantInsert,
): Omit<TripRouteVariantInsert, "localId"> {
  const { localId: _localId, ...update } = row;
  return update;
}

export async function loadTripRouteVariantsForTrip(tripLocalId: string): Promise<TripRouteVariant[]> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(tripRouteVariantsTable)
    .where(
      and(
        eq(tripRouteVariantsTable.tripLocalId, tripLocalId),
        isNull(tripRouteVariantsTable.deletedAt),
      ),
    )
    .orderBy(asc(tripRouteVariantsTable.createdAt), asc(tripRouteVariantsTable.localId));

  return rows.map(toTripRouteVariantFromRow);
}

export async function loadTripRouteVariantSummary(): Promise<TripRouteVariantSummary> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select({
      deletedAt: tripRouteVariantsTable.deletedAt,
      provider: tripRouteVariantsTable.provider,
      tripLocalId: tripRouteVariantsTable.tripLocalId,
      variantType: tripRouteVariantsTable.variantType,
    })
    .from(tripRouteVariantsTable);

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

export async function saveTripRouteVariants(variants: TripRouteVariant[]): Promise<void> {
  await runExclusiveDrizzleWrite(async (database) => {
    for (const variant of variants) {
      const row = toTripRouteVariantRow(variant);

      await database
        .insert(tripRouteVariantsTable)
        .values(row)
        .onConflictDoUpdate({
          target: tripRouteVariantsTable.localId,
          set: toTripRouteVariantUpdate(row),
        });
    }
  });
}
