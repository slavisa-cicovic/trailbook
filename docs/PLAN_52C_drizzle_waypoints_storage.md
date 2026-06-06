# PLAN 52C: Drizzle Waypoints Storage

## Goal

Migrate mobile `waypoints` and `waypoint_attachments` storage to Drizzle while preserving the existing repository API and current sync/restore behavior.

This is the next step after `PLAN_52B` because waypoints are relationship-aware but still much lower volume than `trip_points` and `raw_location_events`.

## Implementation Status

Implemented: 2026-06-05

- Migrated `mobile/src/storage/waypoints-storage.ts` to Drizzle reads, full replace writes, incremental upserts and AsyncStorage migration checks.
- Migrated `mobile/src/storage/waypoint-attachments-storage.ts` to Drizzle while preserving `resolveStoredPhotoUri` normalization.
- Added contract tests for ordering, full replace, incremental save/delete, no-op saves and attachment URI normalization.

## Context

Current storage modules:

- `mobile/src/storage/waypoints-storage.ts`
- `mobile/src/storage/waypoint-attachments-storage.ts`

Current repositories re-export those storage functions:

- `mobile/src/repositories/waypoints-repository.ts`
- `mobile/src/repositories/waypoint-attachments-repository.ts`

Current consumers include:

- recording unit-of-work note creation
- sync worker
- support bundle export
- route screen
- raw event reprocessing
- settings raw reprocessing screen
- waypoint/photo screens through Zustand stores

Both tables are already mirrored in `mobile/src/storage/drizzle/schema.ts`.

## Non-Goals

- Do not change backend sync DTOs.
- Do not change attachment file storage or photo URI resolution.
- Do not change waypoint creation UX.
- Do not change Zustand store shape.
- Do not move `trip_points`, `trips` or `trip_segments`.
- Do not add foreign key constraints in this step.
- Do not change soft-delete semantics.

## Design

Keep public storage/repository functions stable:

```ts
loadWaypoints(): Promise<Waypoint[]>
saveWaypoints(waypoints, previousWaypoints?): Promise<void>

loadWaypointAttachments(): Promise<WaypointAttachment[]>
saveWaypointAttachments(attachments, previousAttachments?): Promise<void>
```

Internally replace manual SQL with Drizzle:

```text
repositories
  -> storage/waypoints-storage.ts
  -> Drizzle waypoints table

repositories
  -> storage/waypoint-attachments-storage.ts
  -> Drizzle waypoint_attachments table
```

The table modules can stay at the current paths to avoid import churn.

## Important Behavior To Preserve

### AsyncStorage Migration

Both modules still perform one-time migration from old AsyncStorage keys:

- `async-storage/waypoints`
- `async-storage/waypoint-attachments`

Preserve this exactly, but implement count checks and inserts with Drizzle.

### Ordering

Preserve load ordering:

```sql
waypoints ORDER BY created_at ASC, local_id ASC
waypoint_attachments ORDER BY created_at ASC, local_id ASC
```

### Full Replace Save

When `previousWaypoints` / `previousAttachments` are not passed:

- delete all rows
- insert all provided rows

This path is used by restore/import-style flows and must remain deterministic.

### Incremental Save

When previous state is passed:

- delete rows removed from next state
- insert/update only changed rows
- no-op if nothing changed

This is important for avoiding unnecessary writes in active app flows.

### Attachment URI Normalization

`waypoint_attachments` must continue to call:

```ts
resolveStoredPhotoUri(...)
```

when mapping DB rows or legacy AsyncStorage values into domain objects.

## Implementation Steps

### Step 1: Convert Waypoint Row Mapping

Replace snake_case SQL row interfaces with Drizzle inferred row types:

```ts
type WaypointRow = typeof waypointsTable.$inferSelect;
type WaypointInsert = typeof waypointsTable.$inferInsert;
```

Keep `normalizeWaypoint`, `toWaypointRow`, `toWaypointFromRow`, and equality comparison semantics.

Acceptance:

- TypeScript catches column name drift.
- Domain object shape is unchanged.

### Step 2: Convert Waypoint Reads

Use `getDrizzleDatabase()` and:

- `select().from(waypointsTable)`
- `orderBy(asc(createdAt), asc(localId))`

Acceptance:

- `loadWaypoints()` returns the same normalized domain objects and same order.

### Step 3: Convert Waypoint Writes

Use `runExclusiveDrizzleWrite()`.

For full replace:

- `delete(waypointsTable)`
- bulk insert if array is not empty

For incremental save:

- delete removed local IDs
- insert/update changed rows with conflict on `localId`

Acceptance:

- write serialization still uses the shared DB queue
- no duplicate primary key errors during update
- no writes when nothing changed

### Step 4: Convert Waypoint AsyncStorage Migration

Replace manual count SQL with Drizzle count or select/limit.

Use Drizzle inserts inside the existing `migrateOnce` callback.

Acceptance:

- existing users with old AsyncStorage waypoint data still migrate once
- migration remains idempotent

### Step 5: Convert Attachment Row Mapping

Use Drizzle inferred row/insert types:

```ts
type WaypointAttachmentRow = typeof waypointAttachmentsTable.$inferSelect;
type WaypointAttachmentInsert = typeof waypointAttachmentsTable.$inferInsert;
```

Keep `resolveStoredPhotoUri` in the domain mapper.

Acceptance:

- local photo URI behavior is unchanged
- sync status and deleted state are preserved

### Step 6: Convert Attachment Reads/Writes/Migration

Repeat the same Drizzle conversion pattern for:

- `loadWaypointAttachments`
- `saveWaypointAttachments`
- AsyncStorage migration

Acceptance:

- ordering stays unchanged
- full replace and incremental save semantics stay unchanged

### Step 7: Tests

Add focused contract tests where practical for both modules:

- load returns rows in expected order
- full replace deletes removed rows and inserts next rows
- incremental save upserts changed rows and deletes removed rows
- no-op incremental save performs no mutation where feasible to assert
- attachment load normalizes stored photo URI

If direct Expo SQLite integration is not practical in Vitest, mock the Drizzle adapter similarly to `app-kv-storage` tests and test the public storage contract.

## Testing

Run:

```bash
npm run typecheck --workspace mobile
npm run lint --workspace mobile
npm test --workspace mobile
npx drizzle-kit check --config=drizzle.config.ts
```

Manual smoke test:

1. Start recording.
2. Add a waypoint note with a photo.
3. Stop recording.
4. Open trip route screen and waypoint screen.
5. Verify waypoint and photo still display.
6. Restart app and verify waypoint/photo still load.
7. Sync trip and verify no sync payload regression.
8. Restore from server and verify waypoint/photo rows load.

## Risks

- The one-time AsyncStorage migration currently checks SQL row count before importing legacy data; moving this check to Drizzle must not trigger circular initialization problems.
- Incremental save must preserve the existing `previous*` comparison behavior, otherwise sync/recording flows may write too much or delete too much.
- Attachment URI normalization is easy to accidentally drop when replacing row mappers.

## Rollback

Rollback is data-safe because the schema is unchanged:

- restore manual SQL implementation in `waypoints-storage.ts`
- restore manual SQL implementation in `waypoint-attachments-storage.ts`
- remove new tests if they depend on Drizzle-only internals

No data migration rollback is required.
