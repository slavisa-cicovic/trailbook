# PLAN 52A: Drizzle Migration Baseline

## Goal

Create a safe migration baseline for Drizzle on mobile so future schema changes can be generated and bundled through Drizzle Kit, while existing databases continue to upgrade through the current legacy `PRAGMA user_version` path.

This plan is intentionally narrow. It does not migrate more repositories to Drizzle.

## Context

`PLAN_52` introduced:

- Drizzle dependencies and config.
- A typed schema mirror under `mobile/src/storage/drizzle/schema.ts`.
- A Drizzle DB adapter under `mobile/src/storage/drizzle/db.ts`.
- Drizzle-backed `trip_groups` and `trip_group_members` storage.

Current migration reality:

- Runtime schema creation still lives in `mobile/src/storage/sqlite/db.ts`.
- `DATABASE_VERSION = 14` and `PRAGMA user_version` remain the current upgrade mechanism.
- No generated Drizzle migrations are bundled yet.

The next risk is having two schema authorities without a clear boundary. This plan defines that boundary.

## Target Rule

Legacy migrations own everything up to the current SQLite schema version.

Drizzle migrations own only schema changes after the baseline.

Startup order must be:

1. Open database.
2. Run legacy `PRAGMA user_version` migrations to current legacy version.
3. Ensure Drizzle migration journal/baseline exists.
4. Run bundled Drizzle migrations after the baseline.

## Non-Goals

- Do not remove legacy migrations.
- Do not migrate additional storage modules.
- Do not change recording write path.
- Do not alter backend schema.
- Do not change restore/sync protocol.
- Do not introduce data transforms unrelated to migration bookkeeping.

## Design

### Baseline Name

Use an explicit baseline marker, for example:

```text
0000_baseline_current_legacy_schema
```

This baseline should represent the existing database after legacy migrations reach `DATABASE_VERSION = 14`.

### Migration Journal Strategy

Drizzle usually tracks applied migrations in its own migration metadata table.

For existing databases:

- run legacy migrations first
- initialize Drizzle migration journal as if baseline is already applied
- do not replay baseline SQL against an existing database

For fresh installs:

- legacy migrations still create the schema first
- Drizzle baseline journal is initialized after that

This avoids double-applying `CREATE TABLE` / `CREATE INDEX` statements.

### Runtime API

Add a dedicated migration function, for example:

```ts
export async function migrateDrizzleDatabaseIfNeeded(): Promise<void>
```

It should be called from the Drizzle DB adapter after `getDatabase()` completes.

Do not hide this logic inside random repositories.

### Config Files

Expected files:

- `mobile/drizzle.config.ts`
- `mobile/src/storage/drizzle/schema.ts`
- `mobile/src/storage/drizzle/db.ts`
- `mobile/src/storage/drizzle/migrations.ts` or equivalent migration loader
- `mobile/drizzle/meta/_journal.json`
- generated migration SQL files under `mobile/drizzle`

If Expo migration bundling requires Metro/Babel changes, keep them minimal and documented.

## Implementation Steps

### Step 1: Inspect Drizzle Expo Migrator

Confirm exact Drizzle Expo migrator behavior:

- where it stores migration metadata
- expected bundled migration format
- whether `useMigrations` is hook-only or whether a non-hook runtime helper is available
- how it behaves if migration metadata table already exists

Acceptance:

- We know the precise metadata table and migration journal semantics before writing baseline code.

### Step 2: Generate Baseline SQL

Use Drizzle Kit to generate SQL from current schema mirror.

Do not blindly run this SQL at startup.

Acceptance:

- Generated SQL matches current schema tables and indexes.
- Any differences from legacy schema are documented and fixed in `schema.ts` or explicitly accepted.

### Step 3: Add Baseline Journal Initialization

Add a guarded initializer that marks the baseline migration as applied after legacy migrations complete.

Rules:

- idempotent
- safe on fresh install
- safe on existing install
- safe if app is interrupted and restarted

Acceptance:

- Calling initializer multiple times has no effect after first success.
- No data table is modified.

### Step 4: Add Drizzle Migration Runner

After baseline is initialized, run bundled Drizzle migrations.

For this first pass there may be no migrations after baseline.

Acceptance:

- startup succeeds with only baseline present
- future generated migrations have a clear place to run

### Step 5: Integrate With DB Adapter

Update `mobile/src/storage/drizzle/db.ts` so Drizzle access ensures:

1. legacy migration
2. Drizzle baseline initialization
3. Drizzle migration runner

Acceptance:

- Drizzle-backed repositories can assume schema is ready.
- Existing non-Drizzle storage remains unaffected.

### Step 6: Add Verification Utilities

Add a small internal check helper or test utility that can verify:

- legacy `PRAGMA user_version`
- Drizzle migration metadata exists
- expected baseline is marked applied
- key tables exist

This can be test-only if preferable.

Acceptance:

- We can diagnose migration state without opening DB Browser manually.

## Testing

### Automated

Run:

```bash
npm run typecheck --workspace mobile
npm run lint --workspace mobile
npm test --workspace mobile
npx drizzle-kit check --config=drizzle.config.ts
```

Add tests where feasible for:

- baseline initializer is idempotent
- generated schema imports compile
- Drizzle-backed group repositories still load/save fixture data

### Manual Fresh Install Test

1. Uninstall app.
2. Install fresh build.
3. Launch app.
4. Log in.
5. Create a trip group.
6. Restart app.
7. Verify group still loads.
8. Verify no migration error logs.

### Manual Existing DB Upgrade Test

1. Start from a DB created before Drizzle baseline.
2. Install updated build.
3. Launch app.
4. Verify trips, groups, waypoints and photos still load.
5. Create/edit a group.
6. Restart app.
7. Verify no duplicate table/index errors.

### Restore Test

1. Clear local trip data.
2. Restore trips from backend.
3. Verify groups/members restore.
4. Verify route screen and trip list work.

## Risks

### Double-Apply Risk

Baseline SQL could be applied on top of a schema already created by legacy migrations.

Mitigation:

- never run baseline SQL as a normal migration against existing app DB
- initialize baseline metadata after legacy migration

### Schema Drift Risk

Drizzle schema mirror may not exactly match legacy SQL.

Mitigation:

- compare generated baseline SQL against legacy `db.ts`
- fix mirror before marking baseline complete

### Startup Ordering Risk

Repositories may access Drizzle before baseline is initialized.

Mitigation:

- centralize through `getDrizzleDatabase()`
- do not create Drizzle DB instances elsewhere

### Expo Bundling Risk

Generated migration files may not be bundled correctly.

Mitigation:

- validate Metro/Babel requirements
- test native Android/iOS build, not only Expo Go

## Rollback

Rollback must be simple:

- keep legacy migrations intact
- keep repositories callable without migration side effects
- if baseline causes startup issues, disable Drizzle migration runner and leave Drizzle query usage on legacy-created schema

Do not delete legacy migrations until several releases after Drizzle migrations are proven.

## Acceptance Criteria

This plan is complete when:

- Drizzle baseline exists and is documented.
- Runtime startup clearly runs legacy migrations before Drizzle migration logic.
- Baseline initialization is idempotent.
- Fresh install works.
- Existing DB upgrade works.
- Restore-from-server works.
- `trip_groups` / `trip_group_members` Drizzle repositories still work.
- No recording hot-path table is migrated or slowed by this plan.

## Follow-Up

After this plan:

1. `PLAN_52B`: migrate `app_kv` to Drizzle.
2. `PLAN_52C`: migrate `waypoints` and `waypoint_attachments`.
3. `PLAN_52D`: migrate `trip_pauses` and route variants.
4. `PLAN_52E`: migrate trip metadata and segments.
5. Later: benchmark hot-path tables before any Drizzle migration.
