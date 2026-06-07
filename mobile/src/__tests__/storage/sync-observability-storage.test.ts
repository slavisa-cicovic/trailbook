import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DiagnosticEvent } from "../../domain/diagnostic-event";
import type { RecordingNativeEventType } from "../../domain/recording-native-event";
import type { TripDiagnostics } from "../../domain/trip-diagnostics";
import type { SyncOutboxStatus } from "../../storage/sync-outbox-storage";

type TableName = "diagnosticEvents" | "recordingNativeEvents" | "syncOutbox" | "tripDiagnostics";
type FakeColumn = {
  columnName: string;
  tableName: TableName;
};
type FakeCondition =
  | { conditions: FakeCondition[]; type: "or" }
  | { column: FakeColumn; type: "eq"; value: string };
type FakeOrder = {
  column: FakeColumn;
  direction: "asc" | "desc";
};
type FakeSqlIncrement = {
  column: FakeColumn;
  type: "increment";
};
type FakeTable = {
  tableName: TableName;
};
type FakeRows = Record<string, unknown>;

const state = vi.hoisted(() => ({
  mutations: [] as string[],
  tables: {
    diagnosticEvents: new Map<string, FakeRows>(),
    recordingNativeEvents: new Map<string, FakeRows>(),
    syncOutbox: new Map<string, FakeRows>(),
    tripDiagnostics: new Map<string, FakeRows>(),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("drizzle-orm", () => ({
  asc: (column: FakeColumn): FakeOrder => ({ column, direction: "asc" }),
  desc: (column: FakeColumn): FakeOrder => ({ column, direction: "desc" }),
  eq: (column: FakeColumn, value: string): FakeCondition => ({ column, type: "eq", value }),
  or: (...conditions: FakeCondition[]): FakeCondition => ({ conditions, type: "or" }),
  sql: (_strings: TemplateStringsArray, column: FakeColumn): FakeSqlIncrement => ({ column, type: "increment" }),
}));

vi.mock("../../storage/sqlite/migrate-once", () => ({
  migrateOnce: async (_key: string, migrate: () => Promise<void>) => migrate(),
}));

vi.mock("../../storage/drizzle/schema", () => {
  function column(tableName: TableName, columnName: string): FakeColumn {
    return { columnName, tableName };
  }

  return {
    diagnosticEvents: {
      tableName: "diagnosticEvents",
      localId: column("diagnosticEvents", "localId"),
      recordedAt: column("diagnosticEvents", "recordedAt"),
    },
    recordingNativeEvents: {
      tableName: "recordingNativeEvents",
      eventType: column("recordingNativeEvents", "eventType"),
      localId: column("recordingNativeEvents", "localId"),
      recordedAt: column("recordingNativeEvents", "recordedAt"),
    },
    syncOutbox: {
      tableName: "syncOutbox",
      attemptCount: column("syncOutbox", "attemptCount"),
      createdAt: column("syncOutbox", "createdAt"),
      id: column("syncOutbox", "id"),
      status: column("syncOutbox", "status"),
    },
    tripDiagnostics: {
      tableName: "tripDiagnostics",
      tripLocalId: column("tripDiagnostics", "tripLocalId"),
      updatedAt: column("tripDiagnostics", "updatedAt"),
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
    update: (table: FakeTable) => ({
      set: (update: FakeRows) => ({
        where: async (condition: FakeCondition) => {
          state.mutations.push(`update:${table.tableName}:${condition.type === "eq" ? condition.value : "where"}`);
          for (const [localId, row] of state.tables[table.tableName]) {
            if (matchesCondition(row, condition)) {
              state.tables[table.tableName].set(localId, applyUpdate(row, update));
            }
          }
        },
      }),
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
      state.mutations.push(`insert:${tableName}:${String(getPrimaryKey(tableName, row))}`);
      state.tables[tableName].set(String(getPrimaryKey(tableName, row)), { ...row });
    }
  };

  return {
    onConflictDoUpdate: async ({ set }: { set: FakeRows }) => {
      for (const row of rows) {
        const localId = String(getPrimaryKey(tableName, row));
        const existingRow = state.tables[tableName].get(localId);
        state.mutations.push(`upsert:${tableName}:${localId}`);
        state.tables[tableName].set(localId, existingRow ? applyUpdate(existingRow, set) : { ...row });
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

  return createSelectChain(getRows, project);
}

function createSelectChain(getRows: () => FakeRows[], project: (row: FakeRows) => FakeRows) {
  return {
    limit: async (limit: number) => getRows().slice(0, limit).map(project),
    orderBy: (...orders: FakeOrder[]) => createSelectChain(
      () => getRows().sort((left, right) => compareRows(left, right, orders)),
      project,
    ),
    then: <TResult1 = FakeRows[], TResult2 = never>(
      onfulfilled?: ((value: FakeRows[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(getRows().map(project)).then(onfulfilled, onrejected),
    where: (condition: FakeCondition) =>
      createSelectChain(() => getRows().filter((row) => matchesCondition(row, condition)), project),
  };
}

function applyUpdate(row: FakeRows, update: FakeRows) {
  const nextRow = { ...row };

  for (const [key, value] of Object.entries(update)) {
    if (isFakeSqlIncrement(value)) {
      nextRow[key] = Number(nextRow[value.column.columnName] ?? 0) + 1;
    } else {
      nextRow[key] = value;
    }
  }

  return nextRow;
}

function isFakeSqlIncrement(value: unknown): value is FakeSqlIncrement {
  return typeof value === "object" && value !== null && "type" in value && value.type === "increment";
}

function getPrimaryKey(tableName: TableName, row: FakeRows) {
  if (tableName === "syncOutbox") {
    return row.id;
  }

  if (tableName === "tripDiagnostics") {
    return row.tripLocalId;
  }

  return row.localId;
}

function matchesCondition(row: FakeRows, condition: FakeCondition): boolean {
  if (condition.type === "or") {
    return condition.conditions.some((childCondition) => matchesCondition(row, childCondition));
  }

  return row[condition.column.columnName] === condition.value;
}

function compareRows(left: FakeRows, right: FakeRows, orders: FakeOrder[]) {
  for (const order of orders) {
    const leftValue = String(left[order.column.columnName] ?? "");
    const rightValue = String(right[order.column.columnName] ?? "");
    const comparison = leftValue.localeCompare(rightValue);

    if (comparison !== 0) {
      return order.direction === "asc" ? comparison : -comparison;
    }
  }

  return 0;
}

function makeDiagnosticEvent(overrides: Partial<DiagnosticEvent> & Pick<DiagnosticEvent, "localId">): DiagnosticEvent {
  const { localId, ...optionalOverrides } = overrides;

  return {
    category: "recording",
    createdAt: "2026-01-01T10:00:00.000Z",
    localId,
    name: localId,
    payload: null,
    recordedAt: "2026-01-01T10:00:00.000Z",
    segmentLocalId: null,
    severity: "info",
    tripLocalId: null,
    ...optionalOverrides,
  };
}

function makeTripDiagnostics(overrides: Partial<TripDiagnostics> & Pick<TripDiagnostics, "tripLocalId">): TripDiagnostics {
  const { tripLocalId, ...optionalOverrides } = overrides;

  return {
    accepted: 1,
    acceptedAfterLongGap: 0,
    accuracyHistogram: {
      gte120m: 0,
      lt10m: 1,
      lt20m: 0,
      lt30m: 0,
      lt50m: 0,
      lt80m: 0,
      lt120m: 0,
      unknown: 0,
    },
    backgroundAccepted: 0,
    backgroundCallbacks: 0,
    backgroundRejected: 0,
    callbackCount: 1,
    decisionCount: 1,
    duplicateCoordinates: 0,
    duplicateTimestamp: 0,
    foregroundAccepted: 1,
    foregroundCallbacks: 1,
    foregroundRejected: 0,
    maxCallbackGapMs: 0,
    maxRecordedGapMs: 0,
    maxSilentGapMs: 0,
    platform: "ios",
    recentEvents: [],
    recordingMode: "auto",
    rejectedByAccuracy: 0,
    rejectedByImpliedSpeed: 0,
    rejectedByJumpDistance: 0,
    rejectedByMinMovement: 0,
    sessionDuplicateRecordedAt: 0,
    silentGapCount: 0,
    tripLocalId,
    updatedAt: "2026-01-01T10:00:00.000Z",
    ...optionalOverrides,
  };
}

describe("diagnostic-events-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.diagnosticEvents.clear();
    state.tables.recordingNativeEvents.clear();
    state.tables.syncOutbox.clear();
    state.tables.tripDiagnostics.clear();
  });

  it("appends, replaces by local id and loads recent events with payloads", async () => {
    const { appendDiagnosticEvent, loadRecentDiagnosticEvents } = await import(
      "../../storage/diagnostic-events-storage"
    );
    const oldEvent = makeDiagnosticEvent({
      localId: "event-1",
      payload: { old: true },
      recordedAt: "2026-01-01T10:00:00.000Z",
    });
    const replacementEvent = makeDiagnosticEvent({
      localId: "event-1",
      payload: { next: true },
      recordedAt: "2026-01-01T11:00:00.000Z",
      severity: "warning",
    });
    const latestEvent = makeDiagnosticEvent({
      localId: "event-2",
      recordedAt: "2026-01-01T12:00:00.000Z",
    });

    await appendDiagnosticEvent(oldEvent);
    await appendDiagnosticEvent(replacementEvent);
    await appendDiagnosticEvent(latestEvent);

    await expect(loadRecentDiagnosticEvents()).resolves.toEqual([latestEvent, replacementEvent]);
  });
});

describe("trip-diagnostics-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.diagnosticEvents.clear();
    state.tables.recordingNativeEvents.clear();
    state.tables.syncOutbox.clear();
    state.tables.tripDiagnostics.clear();
  });

  it("fully replaces diagnostics, clears stale rows and round-trips JSON fields", async () => {
    const { loadTripDiagnostics, saveTripDiagnostics } = await import("../../storage/trip-diagnostics-storage");
    const earlyDiagnostics = makeTripDiagnostics({
      accuracyHistogram: { gte120m: 1, lt10m: 2, lt20m: 3, lt30m: 4, lt50m: 5, lt80m: 6, lt120m: 7, unknown: 8 },
      recentEvents: [
        {
          accuracy: 5,
          altitude: null,
          decision: "accepted",
          latitude: 45,
          longitude: 19,
          receivedAt: "2026-01-01T10:00:00.000Z",
          recordedAt: "2026-01-01T10:00:00.000Z",
          source: "background",
          speed: 3,
        },
      ],
      tripLocalId: "trip-1",
      updatedAt: "2026-01-01T10:00:00.000Z",
    });
    const lateDiagnostics = makeTripDiagnostics({
      tripLocalId: "trip-2",
      updatedAt: "2026-01-01T11:00:00.000Z",
    });

    await saveTripDiagnostics([lateDiagnostics, earlyDiagnostics]);
    await expect(loadTripDiagnostics()).resolves.toEqual([earlyDiagnostics, lateDiagnostics]);

    await saveTripDiagnostics([]);
    expect(state.mutations).toContain("delete-all:tripDiagnostics");
    await expect(loadTripDiagnostics()).resolves.toEqual([]);
  });
});

describe("recording-native-events-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.diagnosticEvents.clear();
    state.tables.recordingNativeEvents.clear();
    state.tables.syncOutbox.clear();
    state.tables.tripDiagnostics.clear();
  });

  it("appends native events, loads recent events and summarizes by event type", async () => {
    const { loadRecentRecordingNativeEvents } = await import("../../storage/recording-native-events-storage");
    const { appendRecordingNativeEvent, loadRecordingNativeEventSummary } = await import(
      "../../repositories/recording-native-events-repository"
    );

    const firstEvent = await appendRecordingNativeEvent({
      eventType: "native_service_started",
      payload: { source: "test" },
      recordedAt: "2026-01-01T10:00:00.000Z",
      tripLocalId: "trip-1",
    });
    const secondEvent = await appendRecordingNativeEvent({
      eventType: "native_service_started",
      recordedAt: "2026-01-01T12:00:00.000Z",
      tripLocalId: "trip-1",
    });
    const thirdEvent = await appendRecordingNativeEvent({
      eventType: "native_watchdog_tick",
      recordedAt: "2026-01-01T11:00:00.000Z",
      tripLocalId: "trip-1",
    });

    await expect(loadRecentRecordingNativeEvents()).resolves.toEqual([secondEvent, thirdEvent, firstEvent]);
    await expect(loadRecordingNativeEventSummary()).resolves.toEqual([
      {
        count: 2,
        eventType: "native_service_started" satisfies RecordingNativeEventType,
        lastRecordedAt: "2026-01-01T12:00:00.000Z",
      },
      {
        count: 1,
        eventType: "native_watchdog_tick" satisfies RecordingNativeEventType,
        lastRecordedAt: "2026-01-01T11:00:00.000Z",
      },
    ]);
  });
});

describe("sync-outbox-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.diagnosticEvents.clear();
    state.tables.recordingNativeEvents.clear();
    state.tables.syncOutbox.clear();
    state.tables.tripDiagnostics.clear();
  });

  it("enqueues, reloads pending items and resets failed rows to pending", async () => {
    const {
      loadPendingSyncOutboxItems,
      markSyncOutboxItemFailed,
    } = await import("../../storage/sync-outbox-storage");
    const { enqueueSyncOutboxItem } = await import("../../repositories/sync-outbox-repository");
    const firstItem = await enqueueSyncOutboxItem({
      entityLocalId: "trip-1",
      entityType: "trip",
      operation: "trip_sync",
      payload: { version: 1 },
    });

    await markSyncOutboxItemFailed(firstItem.id, new Error("network"));
    await enqueueSyncOutboxItem({
      entityLocalId: "trip-1",
      entityType: "trip",
      operation: "trip_sync",
      payload: { version: 2 },
    });

    await expect(loadPendingSyncOutboxItems()).resolves.toMatchObject([
      {
        id: firstItem.id,
        lastError: null,
        payload: { version: 2 },
        status: "pending",
      },
    ]);
  });

  it("updates status, increments attempts and summarizes all outbox statuses", async () => {
    const {
      loadPendingSyncOutboxItems,
      markSyncOutboxItemFailed,
      markSyncOutboxItemRunning,
      markSyncOutboxItemSucceeded,
    } = await import("../../storage/sync-outbox-storage");
    const { enqueueSyncOutboxItem, loadSyncOutboxSummary } = await import(
      "../../repositories/sync-outbox-repository"
    );
    const runningItem = await enqueueSyncOutboxItem({
      entityLocalId: "trip-1",
      entityType: "trip",
      operation: "trip_sync",
      payload: {},
    });
    const failedItem = await enqueueSyncOutboxItem({
      entityLocalId: "trip-2",
      entityType: "trip",
      operation: "trip_sync",
      payload: {},
    });
    const succeededItem = await enqueueSyncOutboxItem({
      entityLocalId: "group-1",
      entityType: "trip_groups",
      operation: "trip_groups_sync",
      payload: {},
    });

    await markSyncOutboxItemRunning(runningItem.id);
    await markSyncOutboxItemFailed(failedItem.id, "failed");
    await markSyncOutboxItemSucceeded(succeededItem.id);

    expect(state.tables.syncOutbox.get(runningItem.id)?.attemptCount).toBe(1);
    expect(state.tables.syncOutbox.get(failedItem.id)?.lastError).toBe("failed");
    expect(state.tables.syncOutbox.get(succeededItem.id)?.lastError).toBeNull();
    await expect(loadPendingSyncOutboxItems()).resolves.toMatchObject([
      {
        id: failedItem.id,
        status: "failed" satisfies SyncOutboxStatus,
      },
    ]);
    await expect(loadSyncOutboxSummary()).resolves.toEqual({
      failed: 1,
      pending: 0,
      running: 1,
      succeeded: 1,
      total: 3,
    });
  });
});
