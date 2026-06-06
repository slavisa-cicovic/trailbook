# PLAN 52H: Keep Hot Path SQL Hardening

## Goal

Keep `trip_points` and `raw_location_events` on optimized raw SQLite, then harden their structure, contracts and documentation so this is an intentional architecture decision rather than unfinished Drizzle migration work.

## Decision

`PLAN_52G` benchmark was run on Android and iOS with 100-row and 500-row scenarios. Both devices returned:

```text
Recommendation: keep raw SQL for this hot path for now.
```

Therefore:

- do not migrate `trip_points` writes to Drizzle
- do not migrate `raw_location_events` writes to Drizzle
- do not migrate stats recomputation writes to Drizzle
- keep Drizzle for already migrated lower-risk storage modules
- keep the benchmark screen for future retesting after Drizzle/Expo/SQLite upgrades

## Context

These tables are close to Trailbook's Android recording reliability problem:

- `raw_location_events` receives high-volume callback batches, especially on Android after sleep/background batching.
- `trip_points` is the accepted route output and is rewritten during restore/reprocessing.
- trip and segment stats are recomputed and denormalized into `trips` and `trip_segments`.

Raw SQL is acceptable here because:

- the operations are high-volume and performance-sensitive
- SQL statements are stable and explicit
- the benchmark does not justify Drizzle overhead on this path
- correctness is more important than uniform ORM usage

## Implementation Status

Implemented:

- documented hot-path raw SQL exception in `trip-points-storage.ts`
- documented hot-path raw SQL exception in `raw-location-events-storage.ts`
- renamed raw event row mappers to explicit names
- renamed trip point row-to-domain mapper to explicit name
- added contract tests for raw event duplicate handling, ordering, pending reads, processing updates, replacement and summaries
- added contract tests for trip point ordering, replacement isolation and trip/segment stats refresh

Not implemented intentionally:

- no production migration to Drizzle
- no recording behavior changes
- no sync payload changes

## Non-Goals

- Do not migrate `trip_points` to Drizzle.
- Do not migrate `raw_location_events` to Drizzle.
- Do not remove Drizzle infrastructure.
- Do not remove legacy SQLite migrations.
- Do not change recording behavior.
- Do not rewrite raw-event reprocessing logic.
- Do not change sync payloads.

## Scope

### Keep Raw SQL

Keep these public APIs backed by optimized raw SQL:

- `insertRawLocationEvents`
- `updateRawLocationEventProcessingResults`
- `replaceRawLocationEventsForTrip`
- `saveTripPoints`
- `replaceTripPointsForTrip`
- `refreshTripStatsForTripLocalId`
- `refreshTripStatsForTripLocalIds`
- `refreshTripSegmentStatsForTripLocalId`
- `refreshTripSegmentStatsForTripLocalIds`

### Optional Later Review

Read-only/reporting helpers can be reconsidered only with a separate benchmark:

- raw event summaries
- pending raw event reads
- trip point reads for UI
- stats reads

For this plan, keep them raw SQL as well unless there is a direct cleanup benefit with no performance risk.

## Architecture Rules

1. Repository boundary remains unchanged.
2. Screens and services must not import storage modules directly.
3. Raw SQL hot-path storage files should be clearly named/commented as intentional optimized SQL.
4. Shared write serialization must stay centralized through `runExclusiveDatabaseWrite`.
5. Synthetic benchmark code must stay isolated under `services/storage-benchmark`.
6. Any future Drizzle experiment must remain behind benchmark/prototype names and must not replace production functions without a new plan.

## Implementation Steps

### Step 1: Document Hot-Path Exception

Add explicit comments near the top of:

- `mobile/src/storage/trip-points-storage.ts`
- `mobile/src/storage/raw-location-events-storage.ts`

The comment should say:

- this file intentionally uses raw SQL
- benchmark result selected `keep raw SQL`
- do not migrate without rerunning benchmark on Android release build
- repository API is still the public boundary

### Step 2: Rename Internal Helpers For Clarity

Improve internal naming without changing public exports.

Candidate changes:

- `toRow` -> `toRawLocationEventRow`
- `fromRow` -> `toRawLocationEvent`
- `toTripPointRow` stays acceptable
- `toTripPointFromRow` -> `toTripPoint`
- stats helpers get names that show whether they update one trip or many trips

Avoid large rewrites. This is readability hardening, not functional refactor.

### Step 3: Split Dense Sections With Local Regions

Keep files in place, but group logic by responsibility:

For `raw-location-events-storage.ts`:

- mapping
- inserts
- processing updates
- reads
- replacement
- summaries

For `trip-points-storage.ts`:

- mapping
- distance/stat calculations
- migrations from legacy AsyncStorage
- reads
- writes/replacements
- stats refresh

This can be done with small comments and ordering changes only if safe.

### Step 4: Add Contract Tests

Add tests against repository/public storage APIs, not against private helpers.

Required raw event tests:

- empty insert returns empty
- duplicate `localId` insert is ignored
- load order is `recordedAt`, `batchIndex`, `localId`
- pending load returns only `processingStatus = pending`
- processing update changes status/decision/accepted point/segment
- replace by trip rejects mixed trip IDs
- replace by trip sorts and replaces only that trip
- summary counts accepted/rejected/duplicate/pending correctly

Required trip point tests:

- load order is `recordedAt`, `localId`
- replace by trip ignores/rejects mixed trip IDs according to current contract
- replace by trip removes previous points for that trip
- replace by trip does not remove another trip's points
- trip stats are refreshed after replacement
- segment stats are refreshed after replacement
- empty replacement clears stats for that trip

If the current test infrastructure is weak, first add a small SQLite test harness that can:

- open isolated test database
- run legacy migrations
- clear relevant tables between tests
- avoid device-specific Expo runtime assumptions where possible

### Step 5: Add Benchmark Result Notes

Update `PLAN_52G` with the observed high-level result:

- Android 100 rows: `keep raw SQL`
- Android 500 rows: `keep raw SQL`
- iOS 100 rows: `keep raw SQL`
- iOS 500 rows: `keep raw SQL`

Do not fake detailed timings if they were not recorded.

### Step 6: Update Main PLAN_52

Move `trip_points` / `raw_location_events` from "deferred" to "decided raw SQL hot path".

Make the final storage architecture explicit:

```text
Drizzle:
  low/medium-volume app data, settings, waypoints, trips metadata, sync/diagnostics

Raw SQL:
  recording hot-path points/events and stats recomputation
```

### Step 7: Keep Benchmark Tool

Do not delete `Settings -> Debug -> Storage benchmark`.

Keep it as a regression/profiling tool for:

- Expo SDK upgrades
- Drizzle upgrades
- Android device testing
- future SQLite driver changes

Add a note in `PLAN_52G` that the tool is intentionally retained.

## Acceptance Criteria

- `trip_points` and `raw_location_events` production behavior is unchanged.
- Public repository APIs remain unchanged.
- Hot-path raw SQL exception is documented in code and plans.
- Contract tests cover duplicate handling, ordering, replacement and stats refresh.
- `npm run typecheck --workspace mobile` passes.
- `npm run lint --workspace mobile` has no new errors.
- No benchmark/prototype Drizzle function is used from production recording or sync flow.

## Verification

Minimum verification after implementation:

```bash
npm run typecheck --workspace mobile
npm run lint --workspace mobile
```

Recommended manual verification:

- Start/stop recording on Android release build.
- Restore a trip from backend.
- Reprocess a route from raw events.
- Run storage benchmark once to confirm debug tool still works.

## Risks

- Refactoring internal helper names can accidentally alter behavior if mixed with logic changes.
- Contract tests may require extra harness work because storage currently uses the app SQLite singleton.
- Keeping raw SQL means schema drift still needs discipline between Drizzle schema mirror and legacy migrations.

## Rollback

Rollback is straightforward because this plan should not change production behavior:

- revert comments/refactor/test additions
- keep `trip_points` and `raw_location_events` raw SQL
- keep current PLAN_52G benchmark decision
