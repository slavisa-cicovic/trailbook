# PLAN 52G: Trip Points And Raw Events Benchmark

## Goal

Decide whether `trip_points`, `raw_location_events` and related stats SQL should stay on optimized raw SQLite or move partially/fully to Drizzle.

This is a benchmark and decision plan, not a migration plan.

## Context

After `PLAN_52F`, most low/medium-risk storage modules use Drizzle. The remaining direct SQLite modules are intentionally high-risk:

- `mobile/src/storage/trip-points-storage.ts`
- `mobile/src/storage/raw-location-events-storage.ts`
- `mobile/src/storage/sqlite/db.ts`

`sqlite/db.ts` remains the legacy migrator, reset helper and backing adapter for Drizzle. It is not a migration target in this plan.

`trip-points-storage.ts` owns:

- point load/save
- trip point restore/import
- per-trip point replacement
- stats recomputation
- trip/segment stats denormalization back into `trips` and `trip_segments`
- cleanup/delete helpers

`raw-location-events-storage.ts` owns:

- raw callback insertion
- duplicate protection through `INSERT OR IGNORE`
- batch processing status updates
- pending raw event reads
- per-trip raw event replacement
- per-trip raw event summary

These are close to the Android recording reliability problem. Any migration here must be justified by measurement.

## Non-Goals

- Do not migrate `trip_points`.
- Do not migrate `raw_location_events`.
- Do not rewrite stats calculations.
- Do not change recording behavior.
- Do not change raw event DTOs or sync payloads.
- Do not remove legacy SQLite migrations.
- Do not optimize route rendering in this plan.

## Key Questions

1. Is Drizzle overhead acceptable for high-volume insert/update batches on Android?
2. Are reads and summary/reporting queries safe to migrate even if writes stay raw SQL?
3. Are stats recomputation queries better left as explicit SQL because they are domain-heavy and already optimized?
4. Can we isolate raw SQL hot paths behind clearer repository functions without migrating them?

## Benchmark Targets

### Raw Location Events

Benchmark current raw SQL implementation against a Drizzle prototype for:

- `insertRawLocationEvents(events)`
  - 1 event
  - 10 events
  - 100 events
  - 500 events
- `updateRawLocationEventProcessingResults(results)`
  - 10 updates
  - 100 updates
  - 500 updates
- `loadRawLocationEventsForTrip(tripLocalId)`
  - 100 rows
  - 1,000 rows
  - 10,000 rows
- `loadPendingRawLocationEventsForTrip(tripLocalId)`
- `replaceRawLocationEventsForTrip(tripLocalId, events)`
- raw event summary by trip

### Trip Points

Benchmark current raw SQL implementation against a Drizzle prototype for:

- appending/adding accepted points in recording-like batches
  - 1 point
  - 10 points
  - 100 points
  - 500 points
- `loadTripPoints()`
- `loadTripPointsForTrip(tripLocalId)`
- `loadTripPointsForSegment(...)` if present
- `replaceTripPointsForTrip(tripLocalId, points)`
- full restore/import save
- delete by trip/local IDs
- trip stats refresh for:
  - one active trip
  - one large restored trip
  - many trips after restore
- segment stats refresh for:
  - one active segment
  - many segments in one trip

## Metrics

Collect per scenario:

- elapsed time in ms
- row count
- batch size
- platform: Android/iOS/simulator
- JS memory pressure if practical
- SQLite write lock duration if practical
- whether UI remains responsive during the operation

Minimum required measurements:

- Android physical device
- release build or preview build, not only Expo Go
- iOS as comparison baseline
- at least one large realistic trip
- at least one Android raw-event batch scenario

## Acceptance Thresholds

Drizzle can be considered for a hot-path operation only if:

- median time is not worse than raw SQL by more than 10 percent
- p95 time is not worse than raw SQL by more than 20 percent
- no measurable increase in missed callbacks or UI stalls during recording
- transaction/write serialization behavior remains the same

If Drizzle is slower but only for read/reporting queries, prefer partial migration:

- keep write hot path raw SQL
- migrate read/reporting helpers only where type safety helps

If Drizzle is slower for writes or stats recomputation, keep those operations raw SQL and document them as intentional optimized SQL.

## Proposed Benchmark Harness

Create a temporary or test-only benchmark utility, preferably under:

```text
mobile/src/services/storage-benchmark/
```

Possible files:

- `storage-benchmark.fixtures.ts`
- `raw-events-storage-benchmark.service.ts`
- `trip-points-storage-benchmark.service.ts`
- `storage-benchmark-runner.ts`

Requirements:

- generate deterministic fake points/events
- avoid hitting production trips unless explicitly requested
- write benchmark rows under synthetic `tripLocalId`
- cleanup benchmark rows after each run
- log structured results through diagnostic events or console warnings
- allow running from a debug/settings screen or a script-like service call

## Prototype Rules

Do not replace current storage functions during benchmarking.

Instead, add parallel prototype functions with names like:

```ts
insertRawLocationEventsWithDrizzleForBenchmark(...)
loadRawLocationEventsWithDrizzleForBenchmark(...)
replaceTripPointsWithDrizzleForBenchmark(...)
```

These functions must:

- use the same database
- use the same schema
- avoid changing production control flow
- be easy to delete after the decision

## Decision Matrix

### Option A: Keep Hot Path Raw SQL

Use when:

- Drizzle writes are slower
- stats recomputation is clearer/faster in SQL
- Android recording reliability could regress

Follow-up:

- rename/structure raw SQL helpers to make intentional optimized SQL obvious
- add contract tests around existing raw SQL behavior
- document hot-path exception in `PLAN_52`

### Option B: Partial Migration

Use when:

- Drizzle reads are fine
- writes or stats are slower/riskier

Candidate partial migrations:

- raw event summary queries
- trip point read-only queries for UI
- stats read tables (`trip_stats`, `trip_segment_stats`) if low risk

Do not migrate:

- recording write path
- raw event insert/update processing path
- stats recomputation writes

### Option C: Full Migration

Use only if:

- Android physical device benchmark is clean
- batch writes are equivalent
- p95 does not regress materially
- code becomes meaningfully safer/simpler

Follow-up:

- create `PLAN_52H` for actual migration
- include rollback strategy
- include Android release smoke test before commit

## Tests To Add Before Any Migration

Regardless of decision, add or strengthen tests for:

- raw event duplicate insert behavior
- raw event ordering by `recordedAt`, `batchIndex`, `localId`
- raw event processing status updates
- trip point ordering by `recordedAt`, `localId`
- trip stats and segment stats refresh behavior
- replace-by-trip rejecting mixed trip IDs
- empty batch no-op behavior

These tests should be written against the public storage API so they remain useful whether internals are raw SQL or Drizzle.

## Manual Benchmark Scenarios

1. Android release build, screen off, AUTO recording.
2. Android release build, app foreground, AUTO recording.
3. Android release build, simulated raw event batch import.
4. Restore a large trip from backend.
5. Reprocess a trip from raw events.
6. Open route screen for a large trip after stats refresh.
7. Repeat equivalent iOS scenario for comparison.

## Outputs

At the end of this plan, produce:

- benchmark result table
- clear recommendation: A, B or C
- follow-up plan:
  - `PLAN_52H_keep_hot_path_sql_hardening.md`, or
  - `PLAN_52H_partial_drizzle_hot_path_reads.md`, or
  - `PLAN_52H_drizzle_trip_points_raw_events_migration.md`

## Implementation Status

Implemented benchmark harness and debug UI:

- `mobile/src/services/storage-benchmark/storage-benchmark.fixtures.ts`
- `mobile/src/services/storage-benchmark/storage-benchmark-runner.ts`
- `mobile/src/services/storage-benchmark/storage-benchmark.types.ts`
- `mobile/src/screens/settings/storage-benchmark-screen.tsx`
- `mobile/app/settings/storage-benchmark.tsx`

The benchmark screen is available only for `test_user` sessions from:

```text
Settings -> Debug -> Storage benchmark
```

Implemented scenarios:

- raw event insert
- raw event load by trip
- raw event processing status update
- raw event replace by trip
- trip point replace by trip, including current stats refresh side effects
- trip point load by trip

Current scope intentionally does not migrate production storage functions. Drizzle implementations are local benchmark prototypes.

Manual execution still required before choosing A/B/C:

- Android physical release/preview build
- iOS comparison run
- at least 100-row and 500-row runs
- optional follow-up with larger realistic restored trip data if Android timings are close to threshold

## Observed Decision

Manual benchmark was run on Android and iOS for 100-row and 500-row scenarios. Both devices returned:

```text
Recommendation: keep raw SQL for this hot path for now.
```

Decision:

- choose Option A
- keep `trip_points` and `raw_location_events` on optimized raw SQL
- keep stats recomputation writes on optimized raw SQL
- create `PLAN_52H_keep_hot_path_sql_hardening.md`
- retain the benchmark debug tool for future Expo/Drizzle/SQLite upgrades

## Risks

- Synthetic benchmarks can miss Android OS throttling behavior.
- Expo Go measurements are not enough for location recording decisions.
- Drizzle prototype code can accidentally become production code if not isolated.
- Stats recomputation is both performance-sensitive and correctness-sensitive.

## Rollback

This plan should not change production behavior. Rollback means:

- remove benchmark/prototype utilities
- remove debug UI entry if added
- keep current raw SQL storage unchanged
