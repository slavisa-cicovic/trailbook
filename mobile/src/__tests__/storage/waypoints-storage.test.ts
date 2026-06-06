import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Waypoint, WaypointAttachment } from "../../domain/trips";

type TableName = "waypointAttachments" | "waypoints";
type FakeColumn = {
  columnName: string;
  tableName: TableName;
};
type FakeTable = {
  tableName: TableName;
};
type FakeCondition = {
  column: FakeColumn;
  value: string;
};
type FakeOrder = {
  column: FakeColumn;
};
type FakeRows = Record<string, unknown>;

const state = vi.hoisted(() => ({
  mutations: [] as string[],
  tables: {
    waypointAttachments: new Map<string, FakeRows>(),
    waypoints: new Map<string, FakeRows>(),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("drizzle-orm", () => ({
  asc: (column: FakeColumn): FakeOrder => ({ column }),
  eq: (column: FakeColumn, value: string): FakeCondition => ({ column, value }),
}));

vi.mock("../../services/media/photo-storage.service", () => ({
  resolveStoredPhotoUri: (uri: string) => `resolved:${uri}`,
}));

vi.mock("../../storage/sqlite/migrate-once", () => ({
  migrateOnce: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/drizzle/schema", () => {
  function column(tableName: TableName, columnName: string): FakeColumn {
    return { columnName, tableName };
  }

  return {
    waypointAttachments: {
      tableName: "waypointAttachments",
      createdAt: column("waypointAttachments", "createdAt"),
      localId: column("waypointAttachments", "localId"),
    },
    waypoints: {
      tableName: "waypoints",
      createdAt: column("waypoints", "createdAt"),
      localId: column("waypoints", "localId"),
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
    where: async (condition: FakeCondition) => {
      state.mutations.push(`delete:${tableName}:${condition.value}`);
      state.tables[tableName].delete(condition.value);
    },
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
    limit: async (limit: number) => getRows().slice(0, limit).map(project),
    orderBy: async (...orders: FakeOrder[]) =>
      getRows()
        .sort((left, right) => compareRows(left, right, orders))
        .map(project),
  };
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

function makeWaypoint(overrides: Partial<Waypoint> & Pick<Waypoint, "localId">): Waypoint {
  const { localId, ...optionalOverrides } = overrides;

  return {
    category: "generic",
    createdAt: "2026-01-01T10:00:00.000Z",
    deletedAt: null,
    deviceId: "device-1",
    latitude: 45,
    localId,
    longitude: 19,
    note: null,
    segmentLocalId: null,
    serverId: null,
    syncStatus: "local-only",
    title: localId,
    tripLocalId: "trip-1",
    updatedAt: "2026-01-01T10:00:00.000Z",
    userId: "user-1",
    ...optionalOverrides,
  };
}

function makeAttachment(
  overrides: Partial<WaypointAttachment> & Pick<WaypointAttachment, "localId" | "waypointLocalId">,
): WaypointAttachment {
  const { localId, waypointLocalId, ...optionalOverrides } = overrides;

  return {
    createdAt: "2026-01-01T10:00:00.000Z",
    deletedAt: null,
    deviceId: "device-1",
    fileSize: null,
    localId,
    localUri: `photo://${localId}`,
    mimeType: "image/jpeg",
    serverId: null,
    syncStatus: "local-only",
    type: "photo",
    updatedAt: "2026-01-01T10:00:00.000Z",
    userId: "user-1",
    waypointLocalId,
    ...optionalOverrides,
  };
}

describe("waypoints-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.waypoints.clear();
    state.tables.waypointAttachments.clear();
  });

  it("fully replaces waypoints and loads them in created order", async () => {
    const { loadWaypoints, saveWaypoints } = await import("../../storage/waypoints-storage");
    const lateWaypoint = makeWaypoint({ createdAt: "2026-01-01T12:00:00.000Z", localId: "waypoint-2" });
    const earlyWaypoint = makeWaypoint({ createdAt: "2026-01-01T11:00:00.000Z", localId: "waypoint-1" });

    await saveWaypoints([lateWaypoint, earlyWaypoint]);

    await expect(loadWaypoints()).resolves.toEqual([earlyWaypoint, lateWaypoint]);
  });

  it("incrementally deletes removed waypoints and upserts changed waypoints", async () => {
    const { loadWaypoints, saveWaypoints } = await import("../../storage/waypoints-storage");
    const previousWaypoint = makeWaypoint({ localId: "waypoint-1", title: "Old title" });
    const removedWaypoint = makeWaypoint({ localId: "waypoint-2" });
    const nextWaypoint = { ...previousWaypoint, title: "New title" };

    await saveWaypoints([previousWaypoint, removedWaypoint]);
    state.mutations = [];
    await saveWaypoints([nextWaypoint], [previousWaypoint, removedWaypoint]);

    expect(state.mutations).toEqual([
      "delete:waypoints:waypoint-2",
      "upsert:waypoints:waypoint-1",
    ]);
    await expect(loadWaypoints()).resolves.toEqual([nextWaypoint]);
  });

  it("does not write when incremental waypoint input is unchanged", async () => {
    const { saveWaypoints } = await import("../../storage/waypoints-storage");
    const waypoint = makeWaypoint({ localId: "waypoint-1" });

    await saveWaypoints([waypoint]);
    state.mutations = [];
    await saveWaypoints([waypoint], [waypoint]);

    expect(state.mutations).toEqual([]);
  });
});

describe("waypoint-attachments-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.waypoints.clear();
    state.tables.waypointAttachments.clear();
  });

  it("fully replaces attachments, loads them in created order and normalizes photo URI", async () => {
    const { loadWaypointAttachments, saveWaypointAttachments } = await import(
      "../../storage/waypoint-attachments-storage"
    );
    const lateAttachment = makeAttachment({
      createdAt: "2026-01-01T12:00:00.000Z",
      localId: "attachment-2",
      waypointLocalId: "waypoint-1",
    });
    const earlyAttachment = makeAttachment({
      createdAt: "2026-01-01T11:00:00.000Z",
      localId: "attachment-1",
      waypointLocalId: "waypoint-1",
    });

    await saveWaypointAttachments([lateAttachment, earlyAttachment]);

    await expect(loadWaypointAttachments()).resolves.toEqual([
      { ...earlyAttachment, localUri: "resolved:photo://attachment-1" },
      { ...lateAttachment, localUri: "resolved:photo://attachment-2" },
    ]);
  });

  it("incrementally deletes removed attachments and upserts changed attachments", async () => {
    const { loadWaypointAttachments, saveWaypointAttachments } = await import(
      "../../storage/waypoint-attachments-storage"
    );
    const previousAttachment = makeAttachment({
      localId: "attachment-1",
      mimeType: "image/jpeg",
      waypointLocalId: "waypoint-1",
    });
    const removedAttachment = makeAttachment({ localId: "attachment-2", waypointLocalId: "waypoint-1" });
    const nextAttachment = { ...previousAttachment, mimeType: "image/png" };

    await saveWaypointAttachments([previousAttachment, removedAttachment]);
    state.mutations = [];
    await saveWaypointAttachments([nextAttachment], [previousAttachment, removedAttachment]);

    expect(state.mutations).toEqual([
      "delete:waypointAttachments:attachment-2",
      "upsert:waypointAttachments:attachment-1",
    ]);
    await expect(loadWaypointAttachments()).resolves.toEqual([
      { ...nextAttachment, localUri: "resolved:photo://attachment-1" },
    ]);
  });

  it("does not write when incremental attachment input is unchanged", async () => {
    const { saveWaypointAttachments } = await import("../../storage/waypoint-attachments-storage");
    const attachment = makeAttachment({ localId: "attachment-1", waypointLocalId: "waypoint-1" });

    await saveWaypointAttachments([attachment]);
    state.mutations = [];
    await saveWaypointAttachments([attachment], [attachment]);

    expect(state.mutations).toEqual([]);
  });
});
