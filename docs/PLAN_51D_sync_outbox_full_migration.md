# PLAN 51D: Sync Outbox Full Migration

## Goal

Move all mobile-to-server synchronization to a durable local outbox.

The current app has an initial outbox worker, but several flows still perform direct sync calls from screens/services. This creates inconsistent retry behavior and makes offline use brittle.

## Current State

Implemented:

- `sync_outbox` SQLite table.
- `sync-worker.service.ts`.
- Manual trip sync can enqueue and drain trip/group sync.

Still incomplete:

- edit/delete flows still call sync directly in places
- attachment upload is coupled to trip sync
- group sync is coarse-grained
- raw events sync is included in trip sync but not separately observable
- outbox status is not fully surfaced in UI
- retry/backoff is minimal

## Implementation Status

Completed in this slice:

- Added a screen-facing sync action layer that enqueues outbox work, drains the worker, and applies synced entities back into local stores.
- Migrated trip delete, restore, edit, manual sync, and share-prep sync from direct server calls to outbox enqueue + drain.
- Migrated trip group create/edit/delete/member changes from direct server calls to outbox enqueue + drain.
- Removed direct trip/group/attachment server sync imports from trip screens; server sync calls now remain behind the sync worker.

Still remaining:

- Split attachment uploads into independently retryable outbox operations.
- Split group sync into finer-grained group/member operations.
- Add raw-event sync visibility and retry UI.
- Add explicit retry/backoff policy and outbox status presentation.

## Scope

In scope:

- Define operation types for every sync mutation.
- Replace direct sync calls in screens with enqueue + worker drain.
- Make attachment upload independently retryable.
- Make trip delete and group delete durable.
- Add raw-events sync status visibility.
- Add conflict/error policy.
- Add UI status model for pending/failed sync.

Out of scope:

- Real background sync without user returning to app.
- Multi-user conflict resolution beyond last-write-wins.
- Server-side merge UI.
- Push notifications.

## Outbox Operations

Suggested operations:

- `trip_upsert`
- `trip_delete`
- `trip_points_chunk_upsert`
- `trip_raw_events_upsert`
- `trip_stats_upsert`
- `attachment_upload`
- `attachment_delete`
- `trip_groups_upsert`
- `trip_group_delete`
- `trip_group_member_upsert`
- `trip_group_member_delete`

We can start with fewer operations, but the table/API should allow this shape.

## Operation Dependencies

Some operations require ordering:

- trip must sync before points, stats, raw events, attachments
- waypoint must sync before attachment upload
- group must sync before group members
- delete should run after pending upload/upsert is cancelled or superseded

Add fields if needed:

- `depends_on_outbox_id`
- `priority`
- `entity_version`
- `idempotency_key`

## Worker Contract

```ts
interface SyncWorker {
  enqueue(operation: SyncOperation): Promise<void>;
  drain(options?: SyncDrainOptions): Promise<SyncDrainResult>;
  retryFailed(entityLocalId?: string): Promise<SyncDrainResult>;
}
```

The worker should:

- mark item `running`
- execute idempotent server call
- update local entity server IDs/status
- mark item `succeeded` or `failed`
- preserve failure message
- not duplicate server data on retry

## UI Contract

Screens should not call server sync functions directly.

They should:

- enqueue operation
- optionally call `drain`
- render state from local sync status/outbox summary

Trip badge should reflect:

- local dirty
- queued
- running
- failed
- synced

## Storage/Repository Boundary

Sync worker should not load all tables for each operation.

Add repository APIs:

```ts
getTripSyncPayload(tripLocalId): Promise<TripSyncPayload>
markTripSynced(result): Promise<void>
getAttachmentUploadPayload(attachmentLocalId): Promise<AttachmentUploadPayload>
markAttachmentUploaded(result): Promise<void>
getGroupSyncPayload(userId): Promise<GroupSyncPayload>
```

## Failure Policy

Classify failures:

- auth failure: refresh token, retry once
- network failure: retry later
- payload validation failure: mark failed and show message
- missing local entity: mark succeeded/no-op if entity was deleted
- server conflict: mark failed until explicit resolution

## Implementation Steps

1. Extend outbox operation type definitions.
2. Add repository payload builders.
3. Migrate trip edit/delete sync.
4. Migrate group create/edit/delete/member sync.
5. Split attachment upload into independent outbox items.
6. Add retry failed action for test users or debug UI.
7. Add outbox summary to Settings/About support bundle.
8. Remove direct sync calls from screens.

## Acceptance Criteria

- All mobile sync mutations create outbox items.
- Failed sync survives app restart.
- Attachments retry without duplicating upload records.
- Deleting a trip/group while pending sync does not resurrect it.
- UI can show failed queued sync clearly.
- Screens do not import server sync functions directly except through worker/use-cases.

## Risks

- Operation dependencies can become complex.
- Over-splitting operations can increase implementation time.
- Server endpoints must remain idempotent.

## Suggested Tests

- enqueue duplicate trip sync updates existing pending item
- trip sync failure remains failed after restart
- retry failed trip sync succeeds
- attachment upload retry does not duplicate attachment
- delete supersedes pending upsert
- group sync after trip server ID assignment
