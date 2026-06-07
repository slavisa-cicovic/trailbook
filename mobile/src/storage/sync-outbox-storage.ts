import { asc, eq, or, sql } from "drizzle-orm";

import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { syncOutbox as syncOutboxTable } from "./drizzle/schema";

export type SyncOutboxEntityType = "trip" | "trip_groups";
export type SyncOutboxOperation = "trip_sync" | "trip_groups_sync";
export type SyncOutboxStatus = "pending" | "running" | "succeeded" | "failed";

export interface SyncOutboxItem<TPayload = unknown> {
  attemptCount: number;
  createdAt: string;
  entityLocalId: string;
  entityType: SyncOutboxEntityType;
  id: string;
  lastError: string | null;
  operation: SyncOutboxOperation;
  payload: TPayload;
  status: SyncOutboxStatus;
  updatedAt: string;
}

type SyncOutboxRow = typeof syncOutboxTable.$inferSelect;
type SyncOutboxInsert = typeof syncOutboxTable.$inferInsert;

function toSyncOutboxItem<TPayload>(row: SyncOutboxRow): SyncOutboxItem<TPayload> {
  return {
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    entityLocalId: row.entityLocalId,
    entityType: row.entityType as SyncOutboxEntityType,
    id: row.id,
    lastError: row.lastError,
    operation: row.operation as SyncOutboxOperation,
    payload: JSON.parse(row.payloadJson) as TPayload,
    status: row.status as SyncOutboxStatus,
    updatedAt: row.updatedAt,
  };
}

export async function insertOrRefreshSyncOutboxRow(input: {
  entityLocalId: string;
  entityType: string;
  id: string;
  now: string;
  operation: string;
  payloadJson: string;
}): Promise<void> {
  const row: SyncOutboxInsert = {
    attemptCount: 0,
    createdAt: input.now,
    entityLocalId: input.entityLocalId,
    entityType: input.entityType,
    id: input.id,
    lastError: null,
    operation: input.operation,
    payloadJson: input.payloadJson,
    status: "pending",
    updatedAt: input.now,
  };

  await runExclusiveDrizzleWrite(async (database) => {
    await database
      .insert(syncOutboxTable)
      .values(row)
      .onConflictDoUpdate({
        target: syncOutboxTable.id,
        set: {
          lastError: null,
          payloadJson: input.payloadJson,
          status: "pending",
          updatedAt: input.now,
        },
      });
  });
}

export async function loadPendingSyncOutboxItems(limit = 20): Promise<SyncOutboxItem[]> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(syncOutboxTable)
    .where(or(eq(syncOutboxTable.status, "pending"), eq(syncOutboxTable.status, "failed")))
    .orderBy(asc(syncOutboxTable.createdAt), asc(syncOutboxTable.id))
    .limit(limit);

  return rows.map(toSyncOutboxItem);
}

export async function loadSyncOutboxStatusRows(): Promise<{ status: string }[]> {
  const database = await getDrizzleDatabase();
  return database.select({ status: syncOutboxTable.status }).from(syncOutboxTable);
}

export async function markSyncOutboxItemRunning(id: string): Promise<void> {
  const now = new Date().toISOString();

  await runExclusiveDrizzleWrite(async (database) => {
    await database
      .update(syncOutboxTable)
      .set({
        attemptCount: sql`${syncOutboxTable.attemptCount} + 1`,
        status: "running",
        updatedAt: now,
      })
      .where(eq(syncOutboxTable.id, id));
  });
}

export async function markSyncOutboxItemSucceeded(id: string): Promise<void> {
  const now = new Date().toISOString();

  await runExclusiveDrizzleWrite(async (database) => {
    await database
      .update(syncOutboxTable)
      .set({
        lastError: null,
        status: "succeeded",
        updatedAt: now,
      })
      .where(eq(syncOutboxTable.id, id));
  });
}

export async function markSyncOutboxItemFailed(id: string, error: unknown): Promise<void> {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);

  await runExclusiveDrizzleWrite(async (database) => {
    await database
      .update(syncOutboxTable)
      .set({
        lastError: message,
        status: "failed",
        updatedAt: now,
      })
      .where(eq(syncOutboxTable.id, id));
  });
}
