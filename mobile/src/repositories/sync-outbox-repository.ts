import type {
  SyncOutboxEntityType,
  SyncOutboxItem,
  SyncOutboxOperation,
  SyncOutboxStatus,
} from "../storage/sync-outbox-storage";
import {
  insertOrRefreshSyncOutboxRow,
  loadPendingSyncOutboxItems,
  loadSyncOutboxStatusRows,
  markSyncOutboxItemFailed,
  markSyncOutboxItemRunning,
  markSyncOutboxItemSucceeded,
} from "../storage/sync-outbox-storage";

export type { SyncOutboxEntityType, SyncOutboxItem, SyncOutboxOperation, SyncOutboxStatus };
export {
  insertOrRefreshSyncOutboxRow,
  loadPendingSyncOutboxItems,
  markSyncOutboxItemFailed,
  markSyncOutboxItemRunning,
  markSyncOutboxItemSucceeded,
};

function createSyncOutboxId(input: {
  entityLocalId: string;
  entityType: SyncOutboxEntityType;
  operation: SyncOutboxOperation;
}): string {
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

  await insertOrRefreshSyncOutboxRow({
    entityLocalId: input.entityLocalId,
    entityType: input.entityType,
    id,
    now,
    operation: input.operation,
    payloadJson,
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

export async function loadSyncOutboxSummary(): Promise<{
  failed: number;
  pending: number;
  running: number;
  succeeded: number;
  total: number;
}> {
  const rows = await loadSyncOutboxStatusRows();
  const summary = { failed: 0, pending: 0, running: 0, succeeded: 0, total: 0 };

  for (const row of rows) {
    const status = row.status as SyncOutboxStatus;
    summary[status] += 1;
    summary.total += 1;
  }

  return summary;
}
