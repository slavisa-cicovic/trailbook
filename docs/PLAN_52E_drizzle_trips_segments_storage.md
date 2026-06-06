# PLAN 52E: Drizzle Trips And Segments Storage

Status: completed on 2026-06-06.

## Goal

Migrate mobile `trips` and `trip_segments` storage modules to Drizzle while preserving current repository APIs, AsyncStorage migrations, stats side effects and recording/sync behavior.

This plan is higher risk than `PLAN_52B` through `PLAN_52D` because these tables are central to recording lifecycle, sync and route rendering.

## Context

Current modules:

- `mobile/src/storage/trips-storage.ts`
- `mobile/src/storage/trip-segments-storage.ts`

Current consumers include:

- recording unit-of-work
- recording pipeline
- raw event reprocessing
- sync worker
- route screen
- raw event reprocessing settings screen
- Zustand stores

Both tables are already mirrored in `mobile/src/storage/drizzle/schema.ts`:

- `trips`
- `tripSegments`

## Non-Goals

- Do not migrate `trip_points`.
- Do not migrate stats recomputation SQL in `trip-points-storage.ts`.
- Do not change sync DTOs or backend schema.
- Do not change recording lifecycle semantics.
- Do not change auto mode or segment transition logic.
- Do not change trip/segment domain types.
- Do not remove legacy `PRAGMA user_version` migrations.

## Important Behavior To Preserve

### Trips

Current API:

```ts
loadTrips(): Promise<Trip[]>
saveTrips(trips: Trip[]): Promise<void>
```

Preserve:

- one-time AsyncStorage migration from `STORAGE_KEYS.trips`
- count check before importing old AsyncStorage rows
- load ordering by `started_at ASC, local_id ASC`
- full replace save semantics: delete all then insert all
- `recordingConfig` stored as JSON string and parsed back to domain object
- status inference for legacy rows
- battery fields, stats fields and sync status mapping

### Trip Segments

Current API:

```ts
loadTripSegments(): Promise<TripSegment[]>
saveTripSegments(tripSegments, previousTripSegments?): Promise<void>
```

Preserve:

- one-time AsyncStorage migration from `STORAGE_KEYS.tripSegments`
- count check before importing old AsyncStorage rows
- load ordering by `started_at ASC, local_id ASC`
- full replace save semantics when `previousTripSegments` is omitted
- incremental delete/upsert behavior when `previousTripSegments` is provided
- no-op behavior when nothing changed
- stats refresh side effects after writes:
  - `refreshTripSegmentStatsForTripLocalIds(...)`
  - `refreshTripStatsForTripLocalIds(...)`
- affected trip local IDs calculation, including changed trip ownership

## Design

Keep public storage/repository functions stable.

Internally replace manual row SQL with Drizzle:

```text
repositories
  -> storage/trips-storage.ts
  -> Drizzle trips table

repositories
  -> storage/trip-segments-storage.ts
  -> Drizzle trip_segments table
```

Do not move stats refresh SQL into Drizzle in this plan. Treat stats refresh as an existing side effect that remains owned by `trip-points-storage.ts`.

## Implementation Steps

### Step 1: Convert Trip Row Mapping

Replace snake_case SQL row interface with:

```ts
type TripRow = typeof tripsTable.$inferSelect;
type TripInsert = typeof tripsTable.$inferInsert;
```

Keep:

- `normalizeTrip`
- `inferTripStatus`
- `toTripRow`
- `toTripFromRow`

Acceptance:

- `recordingConfigJson` remains JSON string in DB
- `recordingConfig` remains object/null in domain
- TypeScript catches column drift

### Step 2: Convert Trip Reads/Writes

Use:

- `getDrizzleDatabase()` for `loadTrips`
- `runExclusiveDrizzleWrite()` for `saveTrips`

Preserve full replace:

- delete all rows
- bulk insert if non-empty

Acceptance:

- load order is unchanged
- save empty clears all trip rows
- write serialization still uses shared DB queue

### Step 3: Convert Trip AsyncStorage Migration

Replace manual count SQL with Drizzle select/limit or count.

Use Drizzle bulk insert for legacy rows.

Acceptance:

- existing SQLite rows prevent legacy AsyncStorage import
- legacy import remains idempotent

### Step 4: Convert Trip Segment Row Mapping

Replace snake_case SQL row interface with:

```ts
type TripSegmentRow = typeof tripSegmentsTable.$inferSelect;
type TripSegmentInsert = typeof tripSegmentsTable.$inferInsert;
```

Keep:

- `normalizeTripSegment`
- `toTripSegmentRow`
- `toTripSegmentFromRow`
- `areTripSegmentsEqual`

Acceptance:

- recording profile normalization remains unchanged
- stats fields remain nullable and mapped correctly

### Step 5: Convert Trip Segment Reads

Use Drizzle:

- select all
- order by `startedAt ASC, localId ASC`

Acceptance:

- `loadTripSegments()` returns the same order and normalized domain objects

### Step 6: Convert Trip Segment Writes

Use `runExclusiveDrizzleWrite()`.

Full replace:

- delete all segment rows
- bulk insert if non-empty
- refresh stats for affected trip IDs exactly as before

Incremental save:

- detect removed and changed rows as before
- delete removed rows by `localId`
- upsert changed rows by `localId`
- preserve no-op early return
- preserve affected trip ID calculation
- refresh stats for affected trips after write

Acceptance:

- no duplicate primary key errors
- no stats refresh when no segment changed
- stats refresh gets the same trip ID set as before

### Step 7: Convert Trip Segment AsyncStorage Migration

Replace manual count SQL with Drizzle select/limit or count.

Use Drizzle bulk insert for legacy rows.

Preserve post-migration stats refresh calls.

Acceptance:

- legacy segment import remains idempotent
- stats refresh still runs after legacy import

### Step 8: Tests

Add contract tests for:

Trips:

- load order
- full replace clears stale rows
- `recordingConfig` JSON round-trip
- legacy-ish normalization of missing status if practical

Trip segments:

- load order
- full replace clears stale rows
- incremental delete/upsert
- no-op incremental save does not mutate or refresh stats
- stats refresh receives expected affected trip IDs
- changed tripLocalId refreshes both old and new trip IDs

Use mocked Drizzle adapter as in previous storage tests if direct Expo SQLite integration remains impractical.

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
2. Add at least one waypoint.
3. Stop recording.
4. Restart app and verify trip appears.
5. Open trip route screen and verify segments/timeline load.
6. Sync and restore one trip.
7. Verify stats and segment distances still display.

## Risks

- `trip_segments` writes trigger stats refresh. Accidentally changing affected trip ID calculation would break stats or leave stale distances.
- `trips` includes `recordingConfig` JSON. Invalid serialization would affect future recording diagnostics/sync payloads.
- Full replace saves are used by restore/import flows. Bulk insert must preserve empty-array clearing behavior.
- These tables are central enough that manual smoke testing is required even if unit tests pass.

## Rollback

Schema is unchanged, so rollback is code-only:

- restore manual SQL implementation in `trips-storage.ts`
- restore manual SQL implementation in `trip-segments-storage.ts`
- remove associated tests if they rely on Drizzle mocks

No data rollback is required.
