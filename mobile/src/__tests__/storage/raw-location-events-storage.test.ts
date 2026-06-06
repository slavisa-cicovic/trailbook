import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  RawLocationEvent,
  RawLocationEventCallbackSource,
  RawLocationEventOrigin,
  RawLocationEventProcessingStatus,
} from "../../domain/raw-location-event";

type RawLocationEventRow = {
  accepted_trip_point_local_id: string | null;
  accuracy: number | null;
  active_segment_local_id: string | null;
  altitude: number | null;
  batch_id: string;
  batch_index: number;
  callback_source: RawLocationEventCallbackSource;
  latitude: number;
  local_id: string;
  longitude: number;
  origin: RawLocationEventOrigin;
  processed_at: string | null;
  processing_decision: string | null;
  processing_status: RawLocationEventProcessingStatus;
  received_at: string;
  recorded_at: string;
  segment_local_id: string | null;
  session_started_at: string | null;
  speed: number | null;
  trip_local_id: string;
};

const state = vi.hoisted(() => ({
  rawEvents: new Map<string, RawLocationEventRow>(),
}));

vi.mock("../../storage/sqlite/db", () => ({
  getDatabase: async () => fakeDatabase,
  runExclusiveDatabaseWrite: async <T>(task: (database: typeof fakeDatabase) => Promise<T>) =>
    task(fakeDatabase),
}));

const fakeDatabase = {
  getAllAsync: async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
    if (sql.includes("GROUP BY trip_local_id")) {
      return buildSummaryRows() as T[];
    }

    const tripLocalId = String(params[0]);
    const rows = [...state.rawEvents.values()].filter((row) => {
      if (row.trip_local_id !== tripLocalId) {
        return false;
      }

      return !sql.includes("processing_status = 'pending'") || row.processing_status === "pending";
    });

    return sortRawRows(rows).map((row) => ({ ...row })) as T[];
  },
  runAsync: async (sql: string, ...params: unknown[]) => {
    if (sql.includes("INSERT OR IGNORE INTO raw_location_events")) {
      const row = rawEventRowFromParams(params);

      if (state.rawEvents.has(row.local_id)) {
        return { changes: 0 };
      }

      state.rawEvents.set(row.local_id, row);
      return { changes: 1 };
    }

    if (sql.includes("UPDATE raw_location_events")) {
      const localId = String(params[5]);
      const existing = state.rawEvents.get(localId);

      if (!existing) {
        return { changes: 0 };
      }

      state.rawEvents.set(localId, {
        ...existing,
        accepted_trip_point_local_id: params[3] as string | null,
        processed_at: String(params[2]),
        processing_decision: params[1] as string | null,
        processing_status: params[0] as RawLocationEventProcessingStatus,
        segment_local_id: params[4] as string | null,
      });
      return { changes: 1 };
    }

    if (sql.includes("DELETE FROM raw_location_events WHERE trip_local_id = ?")) {
      const tripLocalId = String(params[0]);

      for (const [localId, row] of state.rawEvents) {
        if (row.trip_local_id === tripLocalId) {
          state.rawEvents.delete(localId);
        }
      }

      return { changes: 1 };
    }

    if (sql.includes("INSERT OR REPLACE INTO raw_location_events")) {
      const row = rawEventRowFromParams(params);

      state.rawEvents.set(row.local_id, row);
      return { changes: 1 };
    }

    throw new Error(`Unexpected SQL in raw event test: ${sql}`);
  },
};

function rawEventRowFromParams(params: unknown[]): RawLocationEventRow {
  return {
    accepted_trip_point_local_id: params[18] as string | null,
    accuracy: params[12] as number | null,
    active_segment_local_id: params[3] as string | null,
    altitude: params[13] as number | null,
    batch_id: String(params[4]),
    batch_index: Number(params[5]),
    callback_source: params[6] as RawLocationEventCallbackSource,
    latitude: Number(params[10]),
    local_id: String(params[0]),
    longitude: Number(params[11]),
    origin: params[7] as RawLocationEventOrigin,
    processed_at: params[17] as string | null,
    processing_decision: params[16] as string | null,
    processing_status: params[15] as RawLocationEventProcessingStatus,
    received_at: String(params[8]),
    recorded_at: String(params[9]),
    segment_local_id: params[19] as string | null,
    session_started_at: params[2] as string | null,
    speed: params[14] as number | null,
    trip_local_id: String(params[1]),
  };
}

function sortRawRows(rows: RawLocationEventRow[]): RawLocationEventRow[] {
  return [...rows].sort((left, right) => {
    const recordedAtCompare = left.recorded_at.localeCompare(right.recorded_at);

    if (recordedAtCompare !== 0) {
      return recordedAtCompare;
    }

    if (left.batch_index !== right.batch_index) {
      return left.batch_index - right.batch_index;
    }

    return left.local_id.localeCompare(right.local_id);
  });
}

function buildSummaryRows() {
  const rowsByTripId = new Map<string, RawLocationEventRow[]>();

  for (const row of state.rawEvents.values()) {
    rowsByTripId.set(row.trip_local_id, [...(rowsByTripId.get(row.trip_local_id) ?? []), row]);
  }

  return [...rowsByTripId.entries()]
    .map(([tripLocalId, rows]) => ({
      accepted_count: rows.filter((row) => row.processing_status === "accepted").length,
      duplicate_count: rows.filter((row) => row.processing_status === "duplicate").length,
      first_recorded_at: sortRawRows(rows)[0]?.recorded_at ?? null,
      last_recorded_at: sortRawRows(rows).at(-1)?.recorded_at ?? null,
      pending_count: rows.filter((row) => row.processing_status === "pending").length,
      processed_count: rows.filter((row) => row.processing_status !== "pending").length,
      raw_event_count: rows.length,
      rejected_count: rows.filter((row) => row.processing_status === "rejected").length,
      trip_local_id: tripLocalId,
    }))
    .sort((left, right) =>
      (right.last_recorded_at ?? "").localeCompare(left.last_recorded_at ?? "") ||
      left.trip_local_id.localeCompare(right.trip_local_id)
    );
}

function makeRawEvent(overrides: Partial<RawLocationEvent> & Pick<RawLocationEvent, "localId">): RawLocationEvent {
  const { localId, ...optionalOverrides } = overrides;

  return {
    acceptedTripPointLocalId: null,
    accuracy: 8,
    activeSegmentLocalId: "segment-1",
    altitude: 100,
    batchId: "batch-1",
    batchIndex: 0,
    callbackSource: "background",
    latitude: 45,
    localId,
    longitude: 19,
    origin: "device",
    processedAt: null,
    processingDecision: null,
    processingStatus: "pending",
    receivedAt: "2026-01-01T10:00:00.000Z",
    recordedAt: "2026-01-01T10:00:00.000Z",
    segmentLocalId: null,
    sessionStartedAt: "2026-01-01T10:00:00.000Z",
    speed: 0,
    tripLocalId: "trip-1",
    ...optionalOverrides,
  };
}

describe("raw-location-events-storage hot path contract", () => {
  beforeEach(() => {
    state.rawEvents.clear();
  });

  it("returns empty for empty insert batches", async () => {
    const { insertRawLocationEvents } = await import("../../repositories/raw-location-events-repository");

    await expect(insertRawLocationEvents([])).resolves.toEqual([]);
  });

  it("ignores duplicate local IDs during insert", async () => {
    const { insertRawLocationEvents } = await import("../../repositories/raw-location-events-repository");
    const event = makeRawEvent({ localId: "raw-1" });

    await expect(insertRawLocationEvents([event])).resolves.toEqual([event]);
    await expect(insertRawLocationEvents([event])).resolves.toEqual([]);
    expect(state.rawEvents.size).toBe(1);
  });

  it("loads events ordered by recordedAt, batchIndex and localId", async () => {
    const { insertRawLocationEvents, loadRawLocationEventsForTrip } = await import(
      "../../repositories/raw-location-events-repository"
    );

    await insertRawLocationEvents([
      makeRawEvent({ batchIndex: 2, localId: "raw-c", recordedAt: "2026-01-01T10:00:02.000Z" }),
      makeRawEvent({ batchIndex: 1, localId: "raw-b", recordedAt: "2026-01-01T10:00:00.000Z" }),
      makeRawEvent({ batchIndex: 1, localId: "raw-a", recordedAt: "2026-01-01T10:00:00.000Z" }),
    ]);

    await expect(loadRawLocationEventsForTrip("trip-1")).resolves.toMatchObject([
      { localId: "raw-a" },
      { localId: "raw-b" },
      { localId: "raw-c" },
    ]);
  });

  it("loads only pending events from the pending query", async () => {
    const { insertRawLocationEvents, loadPendingRawLocationEventsForTrip } = await import(
      "../../repositories/raw-location-events-repository"
    );

    await insertRawLocationEvents([
      makeRawEvent({ localId: "pending", processingStatus: "pending" }),
      makeRawEvent({ localId: "accepted", processingStatus: "accepted" }),
    ]);

    await expect(loadPendingRawLocationEventsForTrip("trip-1")).resolves.toMatchObject([
      { localId: "pending" },
    ]);
  });

  it("updates processing status, decision and accepted point link", async () => {
    const {
      insertRawLocationEvents,
      loadRawLocationEventsForTrip,
      updateRawLocationEventProcessingResults,
    } = await import("../../repositories/raw-location-events-repository");

    await insertRawLocationEvents([makeRawEvent({ localId: "raw-1" })]);
    await updateRawLocationEventProcessingResults([
      {
        acceptedTripPointLocalId: "point-1",
        localId: "raw-1",
        processedAt: "2026-01-01T10:00:01.000Z",
        processingDecision: "accepted-by-test",
        processingStatus: "accepted",
        segmentLocalId: "segment-1",
      },
    ]);

    await expect(loadRawLocationEventsForTrip("trip-1")).resolves.toMatchObject([
      {
        acceptedTripPointLocalId: "point-1",
        localId: "raw-1",
        processedAt: "2026-01-01T10:00:01.000Z",
        processingDecision: "accepted-by-test",
        processingStatus: "accepted",
        segmentLocalId: "segment-1",
      },
    ]);
  });

  it("rejects replace batches containing another trip", async () => {
    const { replaceRawLocationEventsForTrip } = await import("../../repositories/raw-location-events-repository");

    await expect(
      replaceRawLocationEventsForTrip("trip-1", [
        makeRawEvent({ localId: "raw-1", tripLocalId: "trip-1" }),
        makeRawEvent({ localId: "raw-2", tripLocalId: "trip-2" }),
      ]),
    ).rejects.toThrow("Cannot replace raw events with events from another trip.");
  });

  it("replaces only one trip and keeps replacement order deterministic", async () => {
    const {
      insertRawLocationEvents,
      loadRawLocationEventsForTrip,
      replaceRawLocationEventsForTrip,
    } = await import("../../repositories/raw-location-events-repository");

    await insertRawLocationEvents([
      makeRawEvent({ localId: "old-trip-1", tripLocalId: "trip-1" }),
      makeRawEvent({ localId: "kept-trip-2", tripLocalId: "trip-2" }),
    ]);
    await replaceRawLocationEventsForTrip("trip-1", [
      makeRawEvent({ batchIndex: 2, localId: "new-b", tripLocalId: "trip-1" }),
      makeRawEvent({ batchIndex: 1, localId: "new-a", tripLocalId: "trip-1" }),
    ]);

    await expect(loadRawLocationEventsForTrip("trip-1")).resolves.toMatchObject([
      { localId: "new-a" },
      { localId: "new-b" },
    ]);
    await expect(loadRawLocationEventsForTrip("trip-2")).resolves.toMatchObject([
      { localId: "kept-trip-2" },
    ]);
  });

  it("summarizes raw event statuses by trip", async () => {
    const { insertRawLocationEvents, loadRawLocationEventTripSummaries } = await import(
      "../../repositories/raw-location-events-repository"
    );

    await insertRawLocationEvents([
      makeRawEvent({ localId: "pending", processingStatus: "pending" }),
      makeRawEvent({ localId: "accepted", processingStatus: "accepted" }),
      makeRawEvent({ localId: "duplicate", processingStatus: "duplicate" }),
      makeRawEvent({ localId: "rejected", processingStatus: "rejected" }),
    ]);

    await expect(loadRawLocationEventTripSummaries()).resolves.toMatchObject([
      {
        acceptedCount: 1,
        duplicateCount: 1,
        pendingCount: 1,
        processedCount: 3,
        rawEventCount: 4,
        rejectedCount: 1,
        tripLocalId: "trip-1",
      },
    ]);
  });
});
