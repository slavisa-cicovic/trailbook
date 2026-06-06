# PLAN 52F: Drizzle Sync And Observability Storage

Status: completed on 2026-06-06.

## Goal

Migrate remaining low/medium-risk mobile storage modules to Drizzle before touching recording hot-path tables.

Scope:

- `mobile/src/storage/diagnostic-events-storage.ts`
- `mobile/src/storage/trip-diagnostics-storage.ts`
- `mobile/src/storage/recording-native-events-storage.ts`
- `mobile/src/storage/sync-outbox-storage.ts`

This continues the Drizzle migration while keeping `trip_points` and `raw_location_events` on optimized SQL until we explicitly benchmark them.

## Context

After `PLAN_52E`, the main trip metadata tables use Drizzle:

- `trips`
- `trip_segments`
- `trip_pauses`
- `trip_route_variants`
- `waypoints`
- `waypoint_attachments`
- `trip_groups`
- `trip_group_members`
- `app_kv`

Remaining direct SQL modules fall into two categories.

Lower-risk support tables:

- `diagnostic_events`
- `trip_diagnostics`
- `recording_native_events`
- `sync_outbox`

Hot-path or complex tables:

- `trip_points`
- `raw_location_events`
- stats recomputation SQL in `trip-points-storage.ts`

`PLAN_52F` handles only the first category.

## Non-Goals

- Do not migrate `trip_points`.
- Do not migrate `raw_location_events`.
- Do not change recording pipeline behavior.
- Do not change sync protocol or sync payload shape.
- Do not change diagnostics domain types.
- Do not remove legacy SQLite migrations.
- Do not expose Drizzle above the storage/repository boundary.

## Important Behavior To Preserve

### Diagnostic Events

Current API:

```ts
appendDiagnosticEvent(event): Promise<void>
loadRecentDiagnosticEvents(limit?): Promise<DiagnosticEvent[]>
```

Preserve:

- `INSERT OR REPLACE` by `localId`
- payload JSON serialization and parsing
- default limit behavior
- ordering by `recorded_at DESC, local_id DESC`

### Trip Diagnostics

Current API:

```ts
loadTripDiagnostics(): Promise<TripDiagnostics[]>
saveTripDiagnostics(entries): Promise<void>
```

Preserve:

- one-time AsyncStorage migration from `STORAGE_KEYS.tripDiagnostics`
- existing-row guard before importing legacy AsyncStorage rows
- full replace save semantics
- ordering by `updated_at ASC, trip_local_id ASC`
- JSON fields:
  - `accuracyHistogram`
  - `recentEvents`
- normalization of legacy/missing fields

### Recording Native Events

Current API:

```ts
appendRecordingNativeEvent(input): Promise<RecordingNativeEvent>
loadRecentRecordingNativeEvents(limit?): Promise<RecordingNativeEvent[]>
loadRecordingNativeEventSummary(): Promise<RecordingNativeEventSummary[]>
```

Preserve:

- generated local ID shape
- payload JSON serialization and parsing
- recent ordering by `recorded_at DESC, local_id DESC`
- summary grouping by `event_type`
- summary ordering by `lastRecordedAt DESC, eventType ASC`

### Sync Outbox

Current API:

```ts
enqueueSyncOutboxItem(input): Promise<SyncOutboxItem>
loadPendingSyncOutboxItems(limit?): Promise<SyncOutboxItem[]>
loadSyncOutboxSummary(): Promise<...>
markSyncOutboxItemRunning(id): Promise<void>
markSyncOutboxItemSucceeded(id): Promise<void>
markSyncOutboxItemFailed(id, error): Promise<void>
```

Preserve:

- deterministic outbox ID generation
- enqueue upsert by `id`
- enqueue resets item to `pending`
- enqueue clears `lastError`
- enqueue updates payload and `updatedAt`
- pending loader includes `pending` and `failed`
- pending loader order by `created_at ASC, id ASC`
- running increments `attemptCount`
- succeeded clears `lastError`
- failed stores normalized error message
- summary counts all statuses

## Design

Use existing Drizzle schema tables:

- `diagnosticEvents`
- `tripDiagnostics`
- `recordingNativeEvents`
- `syncOutbox`

Keep all public storage APIs stable. Screens, services and repositories should not change.

Use:

- `getDrizzleDatabase()` for reads
- `runExclusiveDrizzleWrite()` for writes
- typed Drizzle row types:
  - `typeof table.$inferSelect`
  - `typeof table.$inferInsert`

## Implementation Steps

### Step 1: Diagnostic Events

Replace manual SQL with Drizzle:

- `appendDiagnosticEvent`
  - `insert(...).values(row).onConflictDoUpdate(...)`
- `loadRecentDiagnosticEvents`
  - `orderBy(desc(recordedAt), desc(localId)).limit(limit)`

Acceptance:

- duplicate `localId` replaces payload/category/severity fields
- returned events preserve current sort order

### Step 2: Trip Diagnostics

Replace manual SQL with Drizzle:

- AsyncStorage migration guard uses select/limit
- legacy import uses bulk insert
- load uses Drizzle order
- save deletes all and bulk inserts if non-empty

Acceptance:

- legacy import remains idempotent
- JSON fields round-trip
- empty save clears rows

### Step 3: Recording Native Events

Replace manual SQL with Drizzle:

- append inserts generated event
- recent load uses Drizzle order/limit
- summary can use either:
  - Drizzle aggregate query if type-safe enough
  - select all projected rows and aggregate in TypeScript

Prefer TypeScript aggregation for consistency with existing storage contract tests unless performance becomes a real issue.

Acceptance:

- appended event returned exactly as persisted
- recent list ordering remains unchanged
- summary counts and last timestamps match current behavior

### Step 4: Sync Outbox

Replace manual SQL with Drizzle:

- enqueue uses `onConflictDoUpdate`
- pending load uses `or(eq(status, "pending"), eq(status, "failed"))`
- summary can aggregate in TypeScript
- mark running/succeeded/failed use Drizzle update

Acceptance:

- enqueue existing failed/running item resets to pending
- running increments attempt count atomically relative to row value loaded by SQLite
- succeeded clears last error
- failed stores `Error.message` or `String(error)`

If Drizzle update expression for `attemptCount + 1` is awkward, use `sql`${syncOutbox.attemptCount} + 1`` in the update set. Do not read-modify-write in JS.

### Step 5: Tests

Add storage contract tests for:

Diagnostic events:

- append/load ordering
- replacing existing local ID
- payload JSON round-trip

Trip diagnostics:

- full replace and empty clear
- load ordering
- JSON round-trip for histogram/recent events

Recording native events:

- append returns persisted event
- recent ordering
- summary count and max timestamp per event type

Sync outbox:

- enqueue creates pending item
- enqueue same ID updates payload and resets failed item to pending
- pending loader includes pending/failed and excludes running/succeeded
- running increments attempt count
- succeeded clears error
- failed stores error message
- summary counts statuses

Use mocked Drizzle adapter as in earlier storage tests.

## Testing

Run:

```bash
npm run typecheck --workspace mobile
npm run lint --workspace mobile
npm test --workspace mobile
npx drizzle-kit check --config=drizzle.config.ts
```

Manual smoke test:

1. Start app.
2. Trigger sync of one trip.
3. Verify sync outbox summary in debug/settings remains correct.
4. Trigger support/diagnostics bundle.
5. Verify recent diagnostic/native events still display and export.

## Risks

- `sync_outbox` is not high volume, but it is operationally important. Incorrect upsert/update semantics can cause missed sync retries.
- `recording_native_events` and diagnostics are debugging infrastructure. Breaking them makes Android recording investigation harder.
- Aggregating summaries in TypeScript is simpler but can become expensive if these tables grow too much. Keep limits/cleanup strategy in mind for a future plan.

## Rollback

Schema is unchanged, so rollback is code-only:

- restore manual SQL implementation for the four storage modules
- remove associated Drizzle storage tests

No data rollback is required.
