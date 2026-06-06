# PLAN 53: Storage And Repository Cleanup

## Goal

Clean up the mobile storage/repository architecture after the Drizzle migration series.

`PLAN_52A` through `PLAN_52I` introduced Drizzle, migrated stable tables, kept recording hot paths on raw SQL and documented migration ownership. The next step is not another ORM migration. The next step is to make the resulting structure explicit, remove obsolete storage artifacts and reduce ambiguity for future changes.

## Implementation Status

Updated: 2026-06-06

Completed:

- Removed unused `mobile/src/storage/schema.ts` so it cannot be confused with `mobile/src/storage/drizzle/schema.ts`.
- Added `mobile/src/storage/README.md` documenting current storage split, migration ownership and import rules.
- Added `mobile/src/repositories/README.md` documenting repository boundary and accepted direct-storage exceptions.
- Audited direct storage imports and kept them unchanged where they are infrastructure, low-level recording, test or debug/benchmark code.
- Moved raw SQL hot-path comments to the top of `trip-points-storage.ts` and `raw-location-events-storage.ts`.
- Updated `PLAN_52` summary to point to this cleanup plan.

## Current State

Storage is now split intentionally:

- Drizzle-backed stable tables:
  - app key/value state
  - trips and segments metadata
  - waypoints and attachments
  - trip groups and members
  - pauses and route variants
  - sync outbox
  - diagnostics and native recording events
- Raw SQL hot path:
  - `trip_points`
  - `raw_location_events`
  - trip/segment stats recomputation
- Legacy migrations:
  - still authoritative for runtime schema bootstrap
  - guarded by Drizzle baseline/schema contract tests

The cleanup scope addressed these candidates:

- `mobile/src/storage/schema.ts` was an old in-memory database shape and was not used by app code.
- Most `mobile/src/repositories/*` files are thin re-exports over storage modules.
- Storage module naming does not clearly communicate whether a module is Drizzle-backed, raw SQL hot path or config/session storage.
- The boundary rule exists in plan documents, but not in a small current architecture note close to source.

## Non-Goals

- Do not remove legacy SQLite migrations.
- Do not migrate `trip_points` or `raw_location_events` to Drizzle.
- Do not change recording behavior.
- Do not change sync payloads.
- Do not expose Drizzle directly to screens.
- Do not do large file moves unless they remove real confusion.

## Architectural Decision

Keep the repository layer for now, even when it is a thin re-export.

Reason:

- It is a stable boundary for screens, services and controllers.
- It allows future repository logic without changing callers.
- It hides whether storage is Drizzle-backed or raw SQL.

But make that boundary explicit:

- Re-export-only repositories are acceptable when they are deliberate.
- Any non-trivial cross-table query should live in a repository or domain service, not directly in a screen.
- Storage modules should remain implementation details.

## Tasks

### 1. Remove Obsolete Storage Schema Artifact

Inspect `mobile/src/storage/schema.ts`.

If it is unused:

- delete it
- verify no import paths break
- mention in docs that Drizzle schema is now the DB schema mirror

If it is still needed for tests or fixture work:

- rename it to something explicit, for example `legacy-mobile-database-snapshot.ts`
- document that it is not the SQLite schema source

Expected result:

- no file named `storage/schema.ts` that can be confused with `storage/drizzle/schema.ts`

### 2. Add Current Storage Architecture Note

Add a short source-near document, for example:

```text
mobile/src/storage/README.md
```

It should document:

- `storage/drizzle/schema.ts` is the typed schema mirror
- `storage/sqlite/db.ts` still owns runtime legacy migrations
- Drizzle-backed storage uses `getDrizzleDatabase()` / `runExclusiveDrizzleWrite()`
- `trip-points-storage.ts` and `raw-location-events-storage.ts` are intentional raw SQL hot paths
- repositories are the public boundary for app code

Keep this document short and operational. It should be useful while editing code, not a historical plan.

### 3. Document Repository Boundary

Add a short document, for example:

```text
mobile/src/repositories/README.md
```

It should document:

- screens/services should import repositories, not storage modules
- thin re-export repositories are intentional
- repository modules may compose multiple storage modules when useful
- storage implementation choice must not leak above this layer

### 4. Check Direct Storage Imports

Audit direct imports from `mobile/src/storage/*`.

Classify them:

- allowed storage-internal imports
- session/config/theme storage that is effectively app infrastructure
- direct app feature imports that should go through repositories

Do not blindly rewrite everything. Only change imports where the repository abstraction already exists and the replacement is behavior-preserving.

Potential candidates:

- trip/waypoint feature code importing `trips-storage`, `trip-segments-storage`, `waypoints-storage`, `waypoint-attachments-storage`
- sync code importing storage directly where repository wrappers already exist

Keep recording hot-path and session/config flows pragmatic if repository indirection would add no value.

### 5. Standardize Comments In Hot Path Files

Ensure the intentional raw SQL files have consistent top-of-file comments:

- `mobile/src/storage/trip-points-storage.ts`
- `mobile/src/storage/raw-location-events-storage.ts`

The comment should state:

- why it is raw SQL
- which benchmark/plan justified it
- what must happen before migrating it

### 6. Update PLAN_52 Summary

Update `docs/PLAN_52_mobile_drizzle_storage_migration.md` with a final note:

- Drizzle migration phase is complete for stable tables
- legacy migrations remain intentionally
- `PLAN_53` handles cleanup after migration

## Acceptance Criteria

- `storage/schema.ts` is removed or renamed so it cannot be confused with Drizzle schema.
- Storage and repository README files exist and describe the current architecture.
- Any changed imports are behavior-preserving and stay within existing boundaries.
- No recording, sync or restore behavior changes.
- Checks pass:

```bash
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run lint --workspace mobile
```

## Risks

- Over-cleaning can create churn without architectural value.
- Rewriting direct storage imports can accidentally introduce circular dependencies.
- Moving storage files can break fragile relative imports.

Mitigation:

- prefer documentation and small deletions first
- avoid broad folder moves in this plan
- only replace direct imports when the repository already exposes the exact same function

## Rollback

Rollback should be straightforward:

- restore deleted/renamed storage artifact if needed
- revert import cleanup if a circular dependency appears
- documentation-only changes can be reverted independently
