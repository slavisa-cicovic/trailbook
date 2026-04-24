# PLAN 47: Mobile SQLite Persistence

## Goal

Replace the current mobile persistence model based on `AsyncStorage` JSON blobs with a SQLite-backed local data store that is more suitable for a recording-heavy app.

The primary V1 target is:

- trip recording data that grows continuously over time

This includes:

- `trips`
- `trip_segments`
- `trip_points`
- `trip_pauses`
- `waypoints`
- `waypoint_attachments`
- optionally diagnostics data

## Problem

Trailbook currently stores a growing portion of its mobile state in `AsyncStorage`.

That is acceptable for small key-value state such as:

- session
- theme
- lightweight cached config

But it is a weak fit for recording data because the current pattern is usually:

- load a whole collection
- modify one part of it
- write the whole collection back

This becomes increasingly problematic as trip history grows.

Example usage that should be expected from serious users:

- ~30 trips per month
- ~20 km per trip
- many trip points
- recurring waypoint/photo usage

With that usage profile, the current storage model risks:

- slow reads and writes
- larger serialization overhead
- more memory churn
- higher chance of write contention between foreground and background flows
- poorer long-term maintainability

## Product decision

Move recording-related mobile persistence to SQLite.

Keep `AsyncStorage` only for small app-level state where key-value persistence is still the right abstraction.

The migration should be incremental.
Do not attempt a one-shot full rewrite of all mobile storage in one slice.

## Product principle

Recording data should be stored in a structure that supports append-heavy workloads and targeted queries.

A recording app should not behave as if its local database were just a collection of serialized arrays.

## Why SQLite

SQLite is a better fit because it gives us:

- row-level inserts instead of whole-array rewrites
- indexed queries by `tripId`, `userId`, `status`, `recordedAt`
- better support for large trip histories
- cleaner sync queue modeling
- a path toward background-safe and recovery-safe persistence

## Non-goals

- Do not rewrite every store in one PR.
- Do not change server sync semantics in the first slice.
- Do not redesign trip domain entities in V1.
- Do not replace all app state management with SQL queries immediately.
- Do not drop `AsyncStorage` for session/theme/config where it is still appropriate.

## Scope

V1 scope should focus on high-growth entities:

- `trip_points`
- `trip_segments`
- `trips`

V2 can include:

- `trip_pauses`
- `waypoints`
- `waypoint_attachments`
- `trip_diagnostics`

Low-growth entities can remain on `AsyncStorage` longer if needed.

## Recommended storage split

### Keep in `AsyncStorage`

- auth/session snapshot
- theme preferences
- small cached remote config
- app-level flags

### Move to SQLite

- trips
- segments
- pauses
- points
- waypoints
- attachments metadata
- diagnostics summaries / histograms if they keep growing

## Data model direction

SQLite tables should mirror current domain entities closely enough to avoid a risky domain rewrite.

Recommended initial tables:

- `trips`
- `trip_segments`
- `trip_points`
- `trip_pauses`
- `waypoints`
- `waypoint_attachments`

Each table should include:

- local id
- user id
- sync status
- timestamps
- foreign keys by local ids where appropriate

Recommended indexes:

- `trips(user_id, status)`
- `trip_segments(trip_local_id, ended_at)`
- `trip_points(trip_local_id, recorded_at)`
- `trip_pauses(trip_local_id, paused_at)`
- `waypoints(trip_local_id, created_at)`
- `waypoint_attachments(waypoint_local_id)`

## Migration strategy

Do not do a destructive migration first.

Use a staged migration:

### Phase 1: Introduce SQLite infrastructure

- choose SQLite library / access layer
- define schema
- add database init and migration versioning
- add repository layer or storage adapter layer

### Phase 2: Dual-read bootstrap

- on startup, if SQLite is empty and legacy `AsyncStorage` data exists, import it into SQLite
- keep legacy data intact initially
- mark migration completion explicitly

### Phase 3: Write-through migration for selected entities

- write new updates into SQLite
- stop writing selected entities into `AsyncStorage`
- read selected entities only from SQLite

Recommended first entity order:

1. `trip_points`
2. `trip_segments`
3. `trips`

This order gives the biggest performance benefit early.

### Phase 4: Expand to the remaining trip entities

- `trip_pauses`
- `waypoints`
- `waypoint_attachments`
- diagnostics

### Phase 5: Remove legacy `AsyncStorage` data

- only after migration is stable
- only after versioned guardrails and recovery paths exist

## Suggested abstraction

Avoid spreading raw SQL through UI and service code.

Introduce a small persistence layer, for example:

- `mobile/src/storage/sqlite/`
- repositories or table-specific adapters

Possible split:

- `db.ts`
- `migrations.ts`
- `trip-repository.ts`
- `trip-point-repository.ts`
- `trip-segment-repository.ts`
- etc.

The rest of the app should depend on storage functions, not on direct SQL strings.

## Background recording implications

SQLite is especially useful for background recording because:

- appending one point should become a small insert, not a full rewrite
- diagnostics and trip point writes become cheaper
- background task persistence becomes easier to reason about

This is one of the strongest reasons to do the migration.

## Sync implications

SQLite also prepares the ground for better sync behavior later:

- querying only unsynced rows
- chunking by entity/table
- retry-safe local queues
- smaller memory footprint during sync preparation

This plan should not change sync semantics immediately, but it enables a better sync architecture later.

## Risks

- migration bugs could lose local data if done carelessly
- duplicate sources of truth during transition can create inconsistencies
- background and foreground code paths may diverge if adapters are not centralized
- attachment metadata may be easy to migrate, but binary/file lifecycle still needs care

## Risk mitigation

- keep migration idempotent
- keep legacy data until migration is verified
- add migration completion marker
- add integrity checks after import
- introduce table-level tests before switching production reads

## Testing strategy

The migration should be validated with:

- existing users with empty local state
- users with many trips and many points
- active trip present at app start
- interrupted recording present at app start
- sync after migration
- background task writes after migration

## Recommended first implementation slice

The best first slice is:

- SQLite schema + DB bootstrap
- import from `AsyncStorage`
- switch `trip_points` reads/writes to SQLite
- keep the rest unchanged

This gives immediate value where current storage is weakest, while keeping blast radius manageable.

## Future implementation notes

When this plan is implemented:

- choose the SQLite package explicitly
- define schema versioning from day one
- migrate `trip_points` first
- keep `AsyncStorage` only for small state
- add explicit migration diagnostics/logging for test builds

