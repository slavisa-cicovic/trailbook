# PLAN 52I: Legacy Migrations Cleanup

## Goal

Close the mobile storage migration story by defining a safe long-term relationship between:

- legacy `PRAGMA user_version` migrations in `mobile/src/storage/sqlite/db.ts`
- Drizzle schema mirror in `mobile/src/storage/drizzle/schema.ts`
- Drizzle migration baseline in `mobile/src/storage/drizzle/migrations.ts`

The goal is not to delete legacy migrations immediately. The goal is to prevent schema drift and make the current hybrid model explicit, testable and maintainable.

## Decision Context

After `PLAN_52A` through `PLAN_52H`, Trailbook has a deliberate split:

```text
Drizzle:
  low/medium-volume app data, settings, waypoints, trip metadata, sync and diagnostics

Raw SQL:
  recording hot-path points/events and stats recomputation
```

The remaining architectural risk is not query implementation. It is schema ownership.

Currently:

- `sqlite/db.ts` creates and upgrades the real runtime database through manual migrations.
- `drizzle/schema.ts` mirrors the same schema for typed Drizzle queries.
- `drizzle/migrations.ts` applies a no-op baseline because legacy migrations already own the current schema.

This is acceptable, but only if we add guardrails.

## Non-Goals

- Do not remove `sqlite/db.ts`.
- Do not remove `PRAGMA user_version` migrations.
- Do not make Drizzle migrations the only runtime migration system yet.
- Do not change any table schema in this plan.
- Do not touch recording behavior.
- Do not migrate `trip_points` or `raw_location_events`.
- Do not change sync payloads.

## Target Architecture

For now, the runtime startup sequence remains:

```text
getDatabase()
  -> run legacy SQLite migrations up to DATABASE_VERSION

getDrizzleDatabase()
  -> ensure legacy database is initialized
  -> open same database through Drizzle
  -> ensure Drizzle baseline row exists
  -> run bundled Drizzle migrations after baseline
```

Rules:

1. Existing installs are upgraded by legacy migrations first.
2. Drizzle baseline represents "current legacy schema already exists".
3. New schema changes after this point should be authored deliberately:
   - either legacy migration plus Drizzle schema update, or
   - Drizzle migration plus compatibility guard, if/when we switch ownership
4. Schema drift must fail tests before it reaches a device.

## Implementation Status

Implemented:

- documented migration ownership in `sqlite/db.ts`
- documented hybrid Drizzle startup ownership in `drizzle/db.ts`
- documented no-op baseline ownership in `drizzle/migrations.ts`
- added Drizzle migration baseline contract test
- added Drizzle schema mirror contract test for key tables/columns/index names
- added schema-change checklist to `PLAN_52`

Intentionally unchanged:

- legacy migration runtime behavior
- Drizzle baseline behavior
- current SQLite schema
- recording hot-path raw SQL ownership

## Implementation Steps

### Step 1: Add Migration Ownership Documentation

Add comments to:

- `mobile/src/storage/sqlite/db.ts`
- `mobile/src/storage/drizzle/db.ts`
- `mobile/src/storage/drizzle/migrations.ts`

The comments should state:

- legacy migrations are the runtime bootstrap source of truth for existing devices
- Drizzle currently provides typed access and post-baseline migrations
- baseline SQL is intentionally no-op
- changing schema requires updating both legacy migration path and Drizzle schema mirror until ownership changes

### Step 2: Add Schema Drift Test

Add a test that compares the legacy SQLite schema definition against the Drizzle schema mirror at a practical level.

The test should validate:

- all expected tables are present in Drizzle schema
- high-risk tables have all legacy columns mirrored:
  - `trips`
  - `trip_segments`
  - `trip_points`
  - `raw_location_events`
  - `waypoints`
  - `waypoint_attachments`
  - `sync_outbox`
  - `diagnostic_events`
  - `recording_native_events`
- known indexes exist in the Drizzle schema where they matter

Prefer a pragmatic static test over a fragile SQL parser.

Possible approach:

- export a lightweight `DRIZZLE_SCHEMA_EXPECTATIONS` object from a test-only or storage metadata file
- compare it to manually listed required columns/indexes
- keep the expectation list short and focused on drift-prone tables

Do not introspect a real Expo SQLite database from Node tests unless that is already reliable.

### Step 3: Add Migration State Contract Test

Add a unit test for `drizzle/migrations.ts` and/or `drizzle/db.ts` behavior:

- baseline tag must exist in generated journal
- bundled migration for baseline must be no-op
- `DRIZZLE_BASELINE_WHEN` must be derived from journal
- migration config must not accidentally bundle the full baseline SQL into runtime migration

This prevents the previous class of issues:

- missing migration
- invalid bundled SQL import
- baseline being applied twice

### Step 4: Add Developer Checklist

Add a short checklist to `PLAN_52` or a new storage note:

When changing mobile SQLite schema:

1. Update legacy migration in `sqlite/db.ts`.
2. Increment `DATABASE_VERSION`.
3. Update Drizzle schema mirror.
4. Generate/update Drizzle migration only if the change is post-baseline and intentionally owned by Drizzle.
5. Update schema drift test expectations.
6. Run:

```bash
npm run test --workspace mobile
npm run typecheck --workspace mobile
npm run lint --workspace mobile
```

### Step 5: Decide Future Removal Criteria

Document when legacy migrations can be removed or reduced.

Recommended criteria:

- all supported installed versions are already at or above the Drizzle baseline
- at least one public release has shipped with hybrid startup
- restore/sync path has been tested after fresh install and upgrade
- Android release build has passed recording smoke tests
- there is a rollback path for users with older local databases

Until all criteria are true, keep legacy migrations.

## Acceptance Criteria

- No runtime schema behavior changes.
- `sqlite/db.ts`, `drizzle/db.ts` and `drizzle/migrations.ts` clearly document ownership.
- A schema drift test covers key tables/columns.
- A baseline migration contract test covers the no-op baseline.
- `PLAN_52` includes the schema-change developer checklist.
- `npm run test --workspace mobile` passes.
- `npm run typecheck --workspace mobile` passes.
- `npm run lint --workspace mobile` has no new errors.

## Verification

Required:

```bash
npm run test --workspace mobile
npm run typecheck --workspace mobile
npm run lint --workspace mobile
```

Recommended manual verification after implementation:

- fresh install starts correctly
- existing install upgrade starts correctly
- Settings debug migration state still reports baseline as applied
- storage benchmark still opens

## Risks

- A schema drift test can become too broad and brittle if it tries to fully parse SQL.
- Removing legacy migrations too early can strand existing local databases.
- Drizzle and legacy schema can silently diverge if schema changes are rushed.

## Rollback

Rollback is documentation/test-only unless implementation goes beyond this plan:

- remove added comments/checklist/tests
- keep current legacy migration and Drizzle baseline behavior
