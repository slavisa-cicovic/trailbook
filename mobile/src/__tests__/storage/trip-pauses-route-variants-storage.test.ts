import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripRouteVariant } from "../../domain/trip-route-variant";
import type { TripPause } from "../../domain/trips";

type TableName = "tripPauses" | "tripRouteVariants";
type FakeColumn = {
  columnName: string;
  tableName: TableName;
};
type FakeTable = {
  tableName: TableName;
};
type FakeOrder = {
  column: FakeColumn;
};
type FakeCondition =
  | { type: "and"; conditions: FakeCondition[] }
  | { type: "eq"; column: FakeColumn; value: string }
  | { type: "isNull"; column: FakeColumn };
type FakeRows = Record<string, unknown>;

const state = vi.hoisted(() => ({
  mutations: [] as string[],
  tables: {
    tripPauses: new Map<string, FakeRows>(),
    tripRouteVariants: new Map<string, FakeRows>(),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: FakeCondition[]): FakeCondition => ({ conditions, type: "and" }),
  asc: (column: FakeColumn): FakeOrder => ({ column }),
  eq: (column: FakeColumn, value: string): FakeCondition => ({ column, type: "eq", value }),
  isNull: (column: FakeColumn): FakeCondition => ({ column, type: "isNull" }),
}));

vi.mock("../../storage/sqlite/migrate-once", () => ({
  migrateOnce: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/drizzle/schema", () => {
  function column(tableName: TableName, columnName: string): FakeColumn {
    return { columnName, tableName };
  }

  return {
    tripPauses: {
      tableName: "tripPauses",
      localId: column("tripPauses", "localId"),
      startedAt: column("tripPauses", "startedAt"),
    },
    tripRouteVariants: {
      tableName: "tripRouteVariants",
      createdAt: column("tripRouteVariants", "createdAt"),
      deletedAt: column("tripRouteVariants", "deletedAt"),
      localId: column("tripRouteVariants", "localId"),
      provider: column("tripRouteVariants", "provider"),
      tripLocalId: column("tripRouteVariants", "tripLocalId"),
      variantType: column("tripRouteVariants", "variantType"),
    },
  };
});

vi.mock("../../storage/drizzle/db", () => ({
  getDrizzleDatabase: async () => createFakeDatabase(),
  runExclusiveDrizzleWrite: async <T>(task: (database: ReturnType<typeof createFakeDatabase>) => Promise<T>) =>
    task(createFakeDatabase()),
}));

function createFakeDatabase() {
  return {
    delete: (table: FakeTable) => createDeleteQuery(table.tableName),
    insert: (table: FakeTable) => ({
      values: (input: FakeRows | FakeRows[]) => createInsertQuery(table.tableName, input),
    }),
    select: (selection?: Record<string, FakeColumn>) => ({
      from: (table: FakeTable) => createSelectQuery(table.tableName, selection),
    }),
  };
}

function createDeleteQuery(tableName: TableName) {
  const deleteAll = async () => {
    state.mutations.push(`delete-all:${tableName}`);
    state.tables[tableName].clear();
  };

  return {
    then: <TResult1 = void, TResult2 = never>(
      onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => deleteAll().then(onfulfilled, onrejected),
  };
}

function createInsertQuery(tableName: TableName, input: FakeRows | FakeRows[]) {
  const rows = Array.isArray(input) ? input : [input];
  const insertAll = async () => {
    for (const row of rows) {
      state.mutations.push(`insert:${tableName}:${String(row.localId)}`);
      state.tables[tableName].set(String(row.localId), { ...row });
    }
  };

  return {
    onConflictDoUpdate: async ({ set }: { set: FakeRows }) => {
      for (const row of rows) {
        const localId = String(row.localId);
        const existingRow = state.tables[tableName].get(localId);
        state.mutations.push(`upsert:${tableName}:${localId}`);
        state.tables[tableName].set(localId, existingRow ? { ...existingRow, ...set } : { ...row });
      }
    },
    then: <TResult1 = void, TResult2 = never>(
      onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => insertAll().then(onfulfilled, onrejected),
  };
}

function createSelectQuery(tableName: TableName, selection?: Record<string, FakeColumn>) {
  function getRows() {
    return [...state.tables[tableName].values()];
  }

  function project(row: FakeRows) {
    if (!selection) {
      return { ...row };
    }

    return Object.fromEntries(
      Object.entries(selection).map(([selectionKey, column]) => [selectionKey, row[column.columnName]]),
    );
  }

  return {
    then: <TResult1 = FakeRows[], TResult2 = never>(
      onfulfilled?: ((value: FakeRows[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(getRows().map(project)).then(onfulfilled, onrejected),
    limit: async (limit: number) => getRows().slice(0, limit).map(project),
    orderBy: async (...orders: FakeOrder[]) =>
      getRows()
        .sort((left, right) => compareRows(left, right, orders))
        .map(project),
    where: (condition: FakeCondition) => ({
      orderBy: async (...orders: FakeOrder[]) =>
        getRows()
          .filter((row) => matchesCondition(row, condition))
          .sort((left, right) => compareRows(left, right, orders))
          .map(project),
    }),
  };
}

function matchesCondition(row: FakeRows, condition: FakeCondition): boolean {
  if (condition.type === "and") {
    return condition.conditions.every((childCondition) => matchesCondition(row, childCondition));
  }

  if (condition.type === "eq") {
    return row[condition.column.columnName] === condition.value;
  }

  return row[condition.column.columnName] === null;
}

function compareRows(left: FakeRows, right: FakeRows, orders: FakeOrder[]) {
  for (const order of orders) {
    const leftValue = String(left[order.column.columnName] ?? "");
    const rightValue = String(right[order.column.columnName] ?? "");
    const comparison = leftValue.localeCompare(rightValue);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function makeTripPause(overrides: Partial<TripPause> & Pick<TripPause, "localId">): TripPause {
  const { localId, ...optionalOverrides } = overrides;

  return {
    createdAt: "2026-01-01T10:00:00.000Z",
    deviceId: "device-1",
    endedAt: null,
    localId,
    serverId: null,
    startedAt: "2026-01-01T10:00:00.000Z",
    syncStatus: "local-only",
    tripLocalId: "trip-1",
    updatedAt: "2026-01-01T10:00:00.000Z",
    userId: "user-1",
    ...optionalOverrides,
  };
}

function makeTripRouteVariant(
  overrides: Partial<TripRouteVariant> & Pick<TripRouteVariant, "localId">,
): TripRouteVariant {
  const { localId, ...optionalOverrides } = overrides;

  return {
    createdAt: "2026-01-01T10:00:00.000Z",
    deletedAt: null,
    geometry: [{ latitude: 45, longitude: 19 }],
    localId,
    provider: "trailbook",
    serverId: null,
    tripLocalId: "trip-1",
    updatedAt: "2026-01-01T10:00:00.000Z",
    variantType: "raw",
    ...optionalOverrides,
  };
}

describe("trip-pauses-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.tripPauses.clear();
    state.tables.tripRouteVariants.clear();
  });

  it("fully replaces pauses and loads them in started order", async () => {
    const { loadTripPauses, saveTripPauses } = await import("../../storage/trip-pauses-storage");
    const latePause = makeTripPause({ localId: "pause-2", startedAt: "2026-01-01T12:00:00.000Z" });
    const earlyPause = makeTripPause({ localId: "pause-1", startedAt: "2026-01-01T11:00:00.000Z" });

    await saveTripPauses([latePause, earlyPause]);

    await expect(loadTripPauses()).resolves.toEqual([earlyPause, latePause]);
  });

  it("empty pause save clears rows", async () => {
    const { loadTripPauses, saveTripPauses } = await import("../../storage/trip-pauses-storage");

    await saveTripPauses([makeTripPause({ localId: "pause-1" })]);
    await saveTripPauses([]);

    expect(state.mutations).toContain("delete-all:tripPauses");
    await expect(loadTripPauses()).resolves.toEqual([]);
  });
});

describe("trip-route-variants-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.tripPauses.clear();
    state.tables.tripRouteVariants.clear();
  });

  it("loads only active variants for a trip in created order and round-trips geometry", async () => {
    const { loadTripRouteVariantsForTrip, saveTripRouteVariants } = await import(
      "../../storage/trip-route-variants-storage"
    );
    const lateVariant = makeTripRouteVariant({
      createdAt: "2026-01-01T12:00:00.000Z",
      geometry: [{ latitude: 46, longitude: 20 }],
      localId: "variant-2",
      tripLocalId: "trip-1",
    });
    const earlyVariant = makeTripRouteVariant({
      createdAt: "2026-01-01T11:00:00.000Z",
      geometry: [{ latitude: 45, longitude: 19 }],
      localId: "variant-1",
      tripLocalId: "trip-1",
    });
    const deletedVariant = makeTripRouteVariant({
      deletedAt: "2026-01-01T13:00:00.000Z",
      localId: "variant-3",
      tripLocalId: "trip-1",
    });
    const otherTripVariant = makeTripRouteVariant({ localId: "variant-4", tripLocalId: "trip-2" });

    await saveTripRouteVariants([lateVariant, earlyVariant, deletedVariant, otherTripVariant]);

    await expect(loadTripRouteVariantsForTrip("trip-1")).resolves.toEqual([earlyVariant, lateVariant]);
  });

  it("upserts existing variants", async () => {
    const { loadTripRouteVariantsForTrip, saveTripRouteVariants } = await import(
      "../../storage/trip-route-variants-storage"
    );
    const variant = makeTripRouteVariant({ localId: "variant-1", provider: "trailbook" });
    const updatedVariant = {
      ...variant,
      geometry: [{ latitude: 47, longitude: 21 }],
      provider: "valhalla" as const,
    };

    await saveTripRouteVariants([variant]);
    state.mutations = [];
    await saveTripRouteVariants([updatedVariant]);

    expect(state.mutations).toEqual(["upsert:tripRouteVariants:variant-1"]);
    await expect(loadTripRouteVariantsForTrip("trip-1")).resolves.toEqual([updatedVariant]);
  });

  it("summarizes active and deleted variants", async () => {
    const { loadTripRouteVariantSummary, saveTripRouteVariants } = await import(
      "../../storage/trip-route-variants-storage"
    );

    await saveTripRouteVariants([
      makeTripRouteVariant({ localId: "variant-1", provider: "trailbook", tripLocalId: "trip-1", variantType: "raw" }),
      makeTripRouteVariant({ localId: "variant-2", provider: "valhalla", tripLocalId: "trip-1", variantType: "matched" }),
      makeTripRouteVariant({ localId: "variant-3", provider: "trailbook", tripLocalId: "trip-2", variantType: "raw" }),
      makeTripRouteVariant({
        deletedAt: "2026-01-01T13:00:00.000Z",
        localId: "variant-4",
        provider: "manual",
        tripLocalId: "trip-3",
        variantType: "matched",
      }),
    ]);

    await expect(loadTripRouteVariantSummary()).resolves.toEqual({
      activeCount: 3,
      deletedCount: 1,
      providerCounts: {
        trailbook: 2,
        valhalla: 1,
      },
      tripCount: 2,
      variantTypeCounts: {
        matched: 1,
        raw: 2,
      },
    });
  });
});
