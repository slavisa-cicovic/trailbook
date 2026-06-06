# PLAN 52: Mobile Drizzle Storage Migration

## Goal

Improve the mobile SQLite architecture by introducing Drizzle as a typed schema/query/migration layer, without destabilizing recording, sync or restore.

The goal is not to "ORM-ify" the app. The goal is to remove fragile hand-written SQL and manual migration bookkeeping from low-risk areas first, while keeping the current repository/domain boundaries intact.

## Implementation Status

Updated: 2026-06-05

Completed in the first implementation pass:

- Added Drizzle dependencies and config for the mobile workspace.
- Added a Drizzle schema mirror for the current mobile SQLite schema.
- Added a Drizzle database adapter that first runs the existing legacy SQLite migrator.
- Kept existing `PRAGMA user_version` migrations as the runtime source of truth.
- Migrated `trip_groups` storage to Drizzle behind the existing repository API.
- Migrated `trip_group_members` storage to Drizzle behind the existing repository API.
- Migrated shared `app_kv` JSON storage to Drizzle behind the existing storage API.
- Migrated `waypoints` and `waypoint_attachments` storage to Drizzle behind the existing repository API.
- Migrated `trip_pauses` and `trip_route_variants` storage to Drizzle behind the existing APIs.
- Kept recording hot-path tables on existing optimized SQL.

Still intentionally deferred:

- Generated/bundled Drizzle migration baseline.
- Migrating `trips` and `trip_segments`.
- Benchmarking and deciding on `trip_points` / `raw_location_events`.
- Removing legacy SQL migrations.

Subplans:

- `PLAN_52A_drizzle_migration_baseline.md`: define and implement the Drizzle migration baseline/startup strategy before more repository migrations.
- `PLAN_52B_drizzle_app_kv_storage.md`: migrate the shared JSON key-value storage primitive to Drizzle behind the existing API.
- `PLAN_52C_drizzle_waypoints_storage.md`: migrate waypoint and waypoint attachment storage to Drizzle behind the existing repository API.
- `PLAN_52D_drizzle_pauses_route_variants_storage.md`: migrate trip pauses and route variant storage to Drizzle behind the existing APIs.

## Context

Trailbook currently uses:

- `expo-sqlite` directly through `mobile/src/storage/sqlite/db.ts`
- manual `PRAGMA user_version` migrations
- many table-specific `storage/*` modules with repeated row mapping
- repository wrappers over storage modules
- high-volume recording tables such as `raw_location_events` and `trip_points`

This works, but it has architectural cost:

- schema changes are easy to get wrong
- table/column names are duplicated as strings
- row mapping is repeated in many files
- migrations are not generated from schema
- relationship-heavy queries are hard to make type-safe

Drizzle is a reasonable fit because it has an Expo SQLite driver, Drizzle Kit migration generation, bundled migrations for React Native/Expo and Live Queries.

References:

- Expo SQLite docs: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Drizzle Expo SQLite docs: https://orm.drizzle.team/docs/connect-expo-sqlite
- Drizzle transactions docs: https://orm.drizzle.team/docs/transactions

## Non-Goals

- Do not replace SQLite.
- Do not replace Zustand stores in this plan.
- Do not expose Drizzle directly to screens.
- Do not rewrite all storage modules in one pass.
- Do not move recording hot path to Drizzle until measured.
- Do not change backend schema as part of the first phase.
- Do not change sync protocol unless a migrated table requires it.

## Architectural Rule

Screens and domain services must continue to talk to repositories/use-cases.

Drizzle belongs below the repository boundary:

```text
UI screens
  -> hooks/controllers/use-cases
  -> domain services
  -> repositories
  -> Drizzle storage or legacy SQL storage
  -> expo-sqlite
```

This allows gradual migration table by table.

## Key Decision

Use Drizzle first for:

- typed schema definitions
- generated SQL migrations
- lower-risk repository implementations
- typed query composition

Keep manual optimized SQL for:

- recording live writes
- raw event batch writes
- trip point batch replacement
- route reprocessing writes
- stats recomputation hot paths

Those can be migrated later only after profiling on Android.

## Phase 1: Installation And Skeleton

### Goal

Add Drizzle infrastructure without changing runtime behavior.

### Tasks

1. Add dependencies:
   - `drizzle-orm`
   - `drizzle-kit`
   - migration bundling dependency if required by Drizzle Expo setup
2. Add Drizzle config:
   - `mobile/drizzle.config.ts`
   - SQLite dialect
   - Expo driver
   - schema path under `mobile/src/storage/drizzle/schema.ts`
   - output path under `mobile/drizzle`
3. Add Drizzle DB adapter:
   - `mobile/src/storage/drizzle/db.ts`
   - open the same `trailbook.db`
   - expose a typed Drizzle DB instance
4. Keep existing `mobile/src/storage/sqlite/db.ts` as the authoritative runtime migrator for now.
5. Add documentation explaining that Drizzle is initially schema/query-only.

### Acceptance Criteria

- App builds.
- Existing migrations still run.
- No repository behavior changes.
- No table is migrated yet.

## Phase 2: Schema Mirror

### Goal

Create a typed Drizzle schema that mirrors the existing SQLite tables.

### Tasks

Define Drizzle schema for all current tables, but do not switch repositories yet:

- `trips`
- `trip_segments`
- `trip_points`
- `trip_pauses`
- `waypoints`
- `waypoint_attachments`
- `trip_groups`
- `trip_group_members`
- `sync_outbox`
- `raw_location_events`
- `recording_native_events`
- `diagnostic_events`
- `trip_diagnostics`
- `trip_route_variants`
- `app_kv`

Include:

- primary keys
- nullable columns
- indexes matching current SQL
- typed JSON columns stored as text
- enum-like text columns represented as TypeScript unions at mapping boundaries

### Acceptance Criteria

- Drizzle schema compiles.
- Existing TypeScript typecheck passes.
- Schema names match current SQLite table/column names exactly.
- No runtime behavior changes.

## Phase 3: Migration Strategy

### Goal

Move from manual `PRAGMA user_version` migrations to generated/bundled Drizzle migrations safely.

### Proposed Approach

Do not replace all existing migrations immediately.

Use a checkpoint strategy:

1. Existing manual migrations continue to initialize databases up to the current version.
2. Add a Drizzle migration baseline matching the current schema.
3. New schema changes after the baseline are generated through Drizzle Kit.
4. Add a startup migration runner that:
   - runs legacy migrations first
   - then runs Drizzle migrations
5. Keep a compatibility guard to avoid double-applying changes.

### Acceptance Criteria

- Fresh install creates a valid database.
- Existing app database upgrades without data loss.
- `PRAGMA user_version` and Drizzle migration journal cannot conflict.
- Restore-from-server works after migration.

## Phase 4: First Repository Migration

### Goal

Validate Drizzle on a low-risk table before touching core trip recording data.

### Candidate Tables

Recommended first candidates:

1. `trip_groups`
2. `trip_group_members`
3. `app_kv`

Reason:

- low write volume
- easy to manually validate
- not in recording hot path
- useful relationships
- currently has straightforward CRUD

### Tasks

1. Implement Drizzle-backed storage module for `trip_groups`.
2. Implement Drizzle-backed storage module for `trip_group_members`.
3. Keep repository public API unchanged.
4. Add tests for:
   - load
   - save/replace
   - deleted rows
   - sort order
   - sync status preservation
5. Compare output with legacy SQL implementation using fixture data.

### Acceptance Criteria

- Trip groups UI works unchanged.
- Group sync still works.
- Restore-from-server still restores groups/members.
- Typecheck and lint pass.
- No recording code touched.

## Phase 5: Medium-Risk Repository Migration

### Goal

Migrate tables that are important but not high-frequency recording writes.

### Candidate Order

1. `waypoints`
2. `waypoint_attachments`
3. `trip_pauses`
4. `trip_route_variants`
5. `diagnostic_events`
6. `recording_native_events`

### Rules

- Migrate one repository pair at a time.
- Keep domain models unchanged.
- Keep row mapping functions explicit.
- Do not introduce Drizzle into UI hooks.
- Add fixture tests for each migrated repository.

### Acceptance Criteria

- Waypoint CRUD works.
- Photos restore/offline viewing still works.
- Route variants and raw reprocessing UI still work.
- Support bundle still includes diagnostics.

## Phase 6: Trip Metadata Migration

### Goal

Move `trips` and `trip_segments` read/update operations to Drizzle, while keeping high-volume point writes manual.

### Scope

In scope:

- load trips
- save trips
- update trip metadata
- mark deleted
- load segments
- save segments
- segment mode edits

Out of scope:

- live trip point inserts
- raw event inserts
- stats recomputation batch SQL

### Acceptance Criteria

- Trips list works.
- Route screen works.
- Segment edit works.
- Trip sharing/sync still works.
- Restore-from-server works.
- Existing app DB upgrades cleanly.

## Phase 7: Evaluate Hot Path Migration

### Goal

Decide whether Drizzle should be used for recording-heavy tables.

### Tables

- `trip_points`
- `raw_location_events`
- `trip_stats`
- `trip_segment_stats`

### Evaluation

Benchmark on Android and iOS:

- live recording callback write latency
- Android batched callback write latency
- raw reprocessing time
- restore-from-server time
- trip route load time for large trips

Compare:

- current manual SQL
- Drizzle inserts
- Drizzle prepared statements if applicable
- hybrid: Drizzle reads, manual batch writes

### Likely Outcome

Use Drizzle for reads and schema safety, but keep manual SQL for batch writes if it is measurably faster.

### Acceptance Criteria

- No Android recording regression.
- No slower route load for large trips.
- No slower restore for large synced trips.

## Phase 8: Cleanup

### Goal

Remove duplicate schema/migration definitions once Drizzle owns enough of the storage layer.

### Tasks

- Delete migrated legacy SQL functions.
- Reduce duplicated row interfaces.
- Remove obsolete manual migration branches after a safe compatibility window.
- Document how to add a table/column.
- Add migration verification checklist.

### Acceptance Criteria

- Storage layer has one clear migration path.
- New table/column changes start from Drizzle schema.
- Repositories remain stable public API.

## Testing Strategy

### Unit Tests

Add repository tests with fixture rows:

- legacy-to-domain mapping
- domain-to-row mapping
- null handling
- JSON column handling
- deleted row behavior
- sync status behavior

### Migration Tests

At minimum:

- fresh database bootstrap
- upgrade from current `DATABASE_VERSION`
- upgrade with real-ish fixture data
- restore-from-server after migration

### Manual Tests

- create group
- edit group
- remove trip from group
- create waypoint
- add photo
- restore trips
- sync trip
- open large route
- record short trip on Android

## Risks

### Migration Conflict Risk

Legacy `PRAGMA user_version` and Drizzle migration journal can conflict if not sequenced carefully.

Mitigation:

- keep legacy migrations first
- baseline Drizzle after current schema
- add explicit migration logs

### Hot Path Performance Risk

Recording is sensitive on Android.

Mitigation:

- do not migrate hot path early
- benchmark before switching
- keep manual SQL where needed

### Partial Abstraction Risk

Having both legacy SQL and Drizzle can be confusing.

Mitigation:

- clear module naming
- repository API stays stable
- plan tracks which tables are migrated

### Bundle/Build Risk

Drizzle Expo migrations require bundling generated SQL/migration files correctly.

Mitigation:

- validate Expo Go and native builds
- document required config changes
- keep first phase behavior-neutral

## Rollback Strategy

Each migrated repository should be easy to revert because repository public APIs stay unchanged.

Rollback options:

- switch repository implementation back to legacy storage
- keep Drizzle schema but disable Drizzle runtime usage
- retain legacy SQL migrations until Drizzle path is proven

## Suggested Execution Order

1. Add Drizzle infrastructure with no behavior change.
2. Mirror schema.
3. Add migration baseline.
4. Migrate trip groups.
5. Migrate waypoints/attachments.
6. Migrate trip metadata/segments.
7. Benchmark point/raw-event hot path.
8. Cleanup legacy migration code.

## Completion Criteria

This plan is complete when:

- Drizzle schema is the primary mobile schema definition.
- New non-hot-path tables/columns are added through Drizzle migrations.
- Most low/medium-risk repositories use Drizzle.
- Recording hot path has an explicit measured decision: Drizzle or manual SQL.
- Existing app databases upgrade without data loss.
- Fresh installs, restore, sync and recording all pass manual checks.
