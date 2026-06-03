import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

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

interface SyncOutboxRow {
  attempt_count: number;
  created_at: string;
  entity_local_id: string;
  entity_type: SyncOutboxEntityType;
  id: string;
  last_error: string | null;
  operation: SyncOutboxOperation;
  payload_json: string;
  status: SyncOutboxStatus;
  updated_at: string;
}

function toSyncOutboxItem<TPayload>(row: SyncOutboxRow): SyncOutboxItem<TPayload> {
  return {
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
    entityLocalId: row.entity_local_id,
    entityType: row.entity_type,
    id: row.id,
    lastError: row.last_error,
    operation: row.operation,
    payload: JSON.parse(row.payload_json) as TPayload,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function createSyncOutboxId(input: {
  entityLocalId: string;
  entityType: SyncOutboxEntityType;
  operation: SyncOutboxOperation;
}) {
  return `sync-outbox-${input.entityType}-${input.entityLocalId}-${input.operation}`;
}

export async function enqueueSyncOutboxItem<TPayload>(input: {
  entityLocalId: string;
  entityType: SyncOutboxEntityType;
  operation: SyncOutboxOperation;
  payload: TPayload;
}): Promise<SyncOutboxItem<TPayload>> {
  const now = new Date().toISOString();
  const id = createSyncOutboxId(input);
  const payloadJson = JSON.stringify(input.payload ?? {});

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync(
      `INSERT INTO sync_outbox (
        id,
        entity_type,
        entity_local_id,
        operation,
        payload_json,
        status,
        attempt_count,
        last_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload_json = excluded.payload_json,
        status = 'pending',
        last_error = NULL,
        updated_at = excluded.updated_at`,
      id,
      input.entityType,
      input.entityLocalId,
      input.operation,
      payloadJson,
      now,
      now,
    );
  });

  return {
    attemptCount: 0,
    createdAt: now,
    entityLocalId: input.entityLocalId,
    entityType: input.entityType,
    id,
    lastError: null,
    operation: input.operation,
    payload: input.payload,
    status: "pending",
    updatedAt: now,
  };
}

export async function loadPendingSyncOutboxItems(limit = 20): Promise<SyncOutboxItem[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<SyncOutboxRow>(
    `SELECT *
     FROM sync_outbox
     WHERE status IN ('pending', 'failed')
     ORDER BY created_at ASC, id ASC
     LIMIT ?`,
    limit,
  );

  return rows.map(toSyncOutboxItem);
}

export async function loadSyncOutboxSummary(): Promise<{
  failed: number;
  pending: number;
  running: number;
  succeeded: number;
  total: number;
}> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ count: number; status: SyncOutboxStatus }>(
    `SELECT status, COUNT(*) as count
     FROM sync_outbox
     GROUP BY status`,
  );
  const summary = {
    failed: 0,
    pending: 0,
    running: 0,
    succeeded: 0,
    total: 0,
  };

  for (const row of rows) {
    summary[row.status] = row.count;
    summary.total += row.count;
  }

  return summary;
}

export async function markSyncOutboxItemRunning(id: string): Promise<void> {
  const now = new Date().toISOString();

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync(
      `UPDATE sync_outbox
       SET status = 'running',
           attempt_count = attempt_count + 1,
           updated_at = ?
       WHERE id = ?`,
      now,
      id,
    );
  });
}

export async function markSyncOutboxItemSucceeded(id: string): Promise<void> {
  const now = new Date().toISOString();

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync(
      `UPDATE sync_outbox
       SET status = 'succeeded',
           last_error = NULL,
           updated_at = ?
       WHERE id = ?`,
      now,
      id,
    );
  });
}

export async function markSyncOutboxItemFailed(id: string, error: unknown): Promise<void> {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync(
      `UPDATE sync_outbox
       SET status = 'failed',
           last_error = ?,
           updated_at = ?
       WHERE id = ?`,
      message,
      now,
      id,
    );
  });
}
