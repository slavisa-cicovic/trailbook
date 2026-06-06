# PLAN 52D: Drizzle Pauses And Route Variants Storage

## Goal

Migrate mobile `trip_pauses` and `trip_route_variants` storage to Drizzle while preserving existing public APIs and current runtime behavior.

This plan intentionally avoids `trips`, `trip_segments`, `trip_points`, `raw_location_events`, sync outbox and recording diagnostics. Those tables have higher coupling or higher write volume.

## Implementation Status

Implemented: 2026-06-06

- Migrated `mobile/src/storage/trip-pauses-storage.ts` to Drizzle reads, full replace writes and AsyncStorage migration checks.
- Migrated `mobile/src/storage/trip-route-variants-storage.ts` to Drizzle active trip reads, summary reads and upserts.
- Preserved route geometry JSON round-trip and TypeScript summary aggregation behavior.
- Added contract tests for pause ordering/clear behavior and route variant active filtering, upsert, geometry round-trip and summary counts.

## Context

Current modules:

- `mobile/src/storage/trip-pauses-storage.ts`
- `mobile/src/storage/trip-route-variants-storage.ts`

Current consumers:

- `trip-pauses-storage` is used by `mobile/src/state/trip-pauses-store.ts`.
- `trip-route-variants-storage` is used through `mobile/src/repositories/trip-route-variants-repository.ts`.
- Route variant summary is included in support bundle generation.

Both tables already exist in `mobile/src/storage/drizzle/schema.ts`:

- `tripPauses`
- `tripRouteVariants`

## Non-Goals

- Do not change `TripPause` or `TripRouteVariant` domain types.
- Do not change sync protocol.
- Do not change route variant providers or geometry format.
- Do not add foreign key constraints.
- Do not change recording pause/resume behavior.
- Do not migrate `trips` / `trip_segments` in this plan.
- Do not migrate hot-path tables.

## Important Behavior To Preserve

### Trip Pauses

Current API:

```ts
loadTripPauses(): Promise<TripPause[]>
saveTripPauses(tripPauses: TripPause[]): Promise<void>
```

Preserve:

- one-time AsyncStorage migration from `STORAGE_KEYS.tripPauses`
- count check before importing old AsyncStorage data
- load ordering by `started_at ASC, local_id ASC`
- full replace save semantics: delete all then insert all
- normalization fallback dates and `local-only` sync status

### Route Variants

Current API:

```ts
loadTripRouteVariantsForTrip(tripLocalId): Promise<TripRouteVariant[]>
loadTripRouteVariantSummary(): Promise<TripRouteVariantSummary>
saveTripRouteVariants(variants): Promise<void>
```

Preserve:

- only active route variants load for a trip (`deleted_at IS NULL`)
- ordering by `created_at ASC, local_id ASC`
- geometry stored as JSON string and parsed back to domain geometry
- `saveTripRouteVariants` upserts by `local_id`
- summary counts only active rows for provider/type/trip counts, and reports deleted count separately

## Implementation Steps

### Step 1: Convert Trip Pause Mapping

Replace snake_case SQL row interfaces with Drizzle inferred row types:

```ts
type TripPauseRow = typeof tripPausesTable.$inferSelect;
type TripPauseInsert = typeof tripPausesTable.$inferInsert;
```

Keep `normalizeTripPause`, `toTripPauseRow`, and `toTripPauseFromRow` semantics.

Acceptance:

- domain output is unchanged
- TypeScript catches table/column drift

### Step 2: Convert Trip Pause Reads/Writes

Use:

- `getDrizzleDatabase()` for `loadTripPauses`
- `runExclusiveDrizzleWrite()` for `saveTripPauses`

Preserve full replace behavior:

- delete all rows
- bulk insert if non-empty

Acceptance:

- load order stays unchanged
- empty save clears table
- write serialization still uses shared DB queue

### Step 3: Convert Trip Pause AsyncStorage Migration

Replace manual count SQL with Drizzle select/limit or count.

Use Drizzle bulk insert for legacy rows.

Acceptance:

- legacy AsyncStorage import remains idempotent
- existing rows prevent duplicate import

### Step 4: Convert Route Variant Mapping

Replace `TripRouteVariantRow` with Drizzle inferred types:

```ts
type TripRouteVariantRow = typeof tripRouteVariantsTable.$inferSelect;
type TripRouteVariantInsert = typeof tripRouteVariantsTable.$inferInsert;
```

Keep JSON serialization/deserialization:

- `geometryJson = JSON.stringify(variant.geometry)`
- `geometry = JSON.parse(row.geometryJson)`

Acceptance:

- route geometry round-trips exactly
- provider and variant type domain casts remain explicit

### Step 5: Convert Route Variant Reads

Use Drizzle for:

- active variants by trip
- all rows for summary

For summary, keep aggregation in TypeScript for now. This preserves behavior and avoids introducing SQL aggregation changes in the same step.

Acceptance:

- active trip query filters `deletedAt === null`
- summary matches previous active/deleted counting behavior

### Step 6: Convert Route Variant Writes

Use `runExclusiveDrizzleWrite()` and upsert by `localId`.

Acceptance:

- saving existing variant updates geometry/deleted state/provider/type
- saving new variant inserts it
- no duplicate primary key errors

### Step 7: Tests

Add focused contract tests:

Trip pauses:

- full replace load order
- empty save clears rows
- normalization from partial legacy values if practical

Route variants:

- active-only load by trip
- ordering by created/local ID
- geometry JSON round-trip
- upsert updates existing route variant
- summary active/deleted/provider/type/trip counts

If direct Expo SQLite integration is not practical, use a mocked Drizzle adapter as in existing storage contract tests.

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
2. Pause and resume if UI path is available.
3. Stop recording.
4. Restart app and verify trip pause state still loads.
5. Open a route that has route variants.
6. Verify route display and support bundle route variant summary still work.

## Risks

- Pause storage is part of recording state. Preserve write serialization and full replace semantics.
- Route variant summary could subtly change if filtering behavior changes. Keep summary counting in TypeScript initially.
- Geometry JSON parsing errors are already possible with corrupt rows. This plan does not introduce recovery behavior.

## Rollback

Schema is unchanged, so rollback is straightforward:

- restore manual SQL implementation in `trip-pauses-storage.ts`
- restore manual SQL implementation in `trip-route-variants-storage.ts`
- remove associated tests if they rely on Drizzle mocks

No data rollback is required.
