import { and, asc, eq, isNull } from "drizzle-orm";

import type { TripRouteVariant } from "../domain/trip-route-variant";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { tripRouteVariants as tripRouteVariantsTable } from "./drizzle/schema";

type TripRouteVariantRow = typeof tripRouteVariantsTable.$inferSelect;
type TripRouteVariantInsert = typeof tripRouteVariantsTable.$inferInsert;

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

export async function loadTripRouteVariantSummaryRows(): Promise<
  { deletedAt: string | null; provider: string; tripLocalId: string; variantType: string }[]
> {
  const database = await getDrizzleDatabase();
  return database
    .select({
      deletedAt: tripRouteVariantsTable.deletedAt,
      provider: tripRouteVariantsTable.provider,
      tripLocalId: tripRouteVariantsTable.tripLocalId,
      variantType: tripRouteVariantsTable.variantType,
    })
    .from(tripRouteVariantsTable);
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
