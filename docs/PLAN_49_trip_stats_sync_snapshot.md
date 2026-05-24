# PLAN 49: Trip Stats Sync Snapshot

## Goal

Make trip and segment statistics first-class synced data.

The mobile app already calculates trip stats while recording and while repairing/importing local data. The backend should store those calculated values and return them during restore/shared-trip import, instead of recalculating them from raw points.

## Product Decision

Trip stats are a denormalized snapshot owned by the trip data producer.

For normal user-owned trips:

- mobile calculates stats
- mobile sends stats during sync
- backend stores stats
- backend returns stored stats during restore/import

For shared trips:

- backend returns the owner-synced stats
- receiving mobile app stores those stats directly
- receiving mobile app does not recalculate unless stats are missing

Backend should not recompute stats during normal sync.

## Current Problem

Mobile currently has separate SQLite cache tables:

- `trip_stats`
- `trip_segment_stats`

Backend does not have equivalent stored stats.

This creates several issues:

- restore/import requires mobile to recalculate stats from points
- shared-trip import has the same problem
- server and mobile have different persistence models
- existing helper names like `updateTripSegmentStatsForTripLocalIds` hide whether we are updating one active recording or repairing many imported trips

## Target Model

Stats should be stored directly on the entities they describe.

### Mobile SQLite

Add stats columns to `trips`:

- `point_count INTEGER`
- `distance_meters REAL`
- `stats_updated_at TEXT`

Add stats columns to `trip_segments`:

- `point_count INTEGER`
- `distance_meters REAL`
- `duration_ms INTEGER`
- `stats_updated_at TEXT`

The existing `trip_stats` and `trip_segment_stats` tables can be kept temporarily for migration/fallback, but new code should read/write the entity columns.

### Backend Prisma

Add matching fields to `Trip`:

- `pointCount Int? @map("point_count")`
- `distanceMeters Float? @map("distance_meters")`
- `statsUpdatedAt DateTime? @map("stats_updated_at")`

Add matching fields to `TripSegment`:

- `pointCount Int? @map("point_count")`
- `distanceMeters Float? @map("distance_meters")`
- `durationMs Int? @map("duration_ms")`
- `statsUpdatedAt DateTime? @map("stats_updated_at")`

Stats are nullable at first so existing backend rows remain valid.

## Sync Contract

Extend trip sync payload with stats:

- `tripStats`
- `segmentStats[]`

Suggested shape:

```ts
interface SyncTripStatsDto {
  distanceMeters: number;
  pointCount: number;
  updatedAt: string;
}

interface SyncTripSegmentStatsDto {
  segmentLocalId: string;
  distanceMeters: number;
  durationMs: number;
  pointCount: number;
  updatedAt: string;
}
```

Stats should be sent after the mobile app has a complete local view of the trip.

For chunked point sync, avoid attaching stats to every point chunk. Prefer one of:

- include stats in the existing final trip metadata sync once points are complete
- add `POST /trips/:tripId/stats/sync`

The separate endpoint is clearer and also works for legacy backfill from Settings.

## Restore and Import Contract

Owned trip restore should return:

- trip fields including `tripStats`
- segment fields including segment stats

Shared trip import should return the same stats fields.

Mobile import behavior:

- if stats are present, write them directly into `trips` and `trip_segments`
- if stats are missing, calculate locally as fallback
- do not recalculate stats when valid stats were supplied by backend

## Mobile Refactor

### 1. SQLite Migration

Increment `DATABASE_VERSION`.

Add stats columns to:

- `trips`
- `trip_segments`

Backfill from existing local cache tables:

- `trip_stats -> trips`
- `trip_segment_stats -> trip_segments`

Do not drop old stats tables immediately. Keeping them during the transition reduces rollback risk.

### 2. Domain Types

Add stats fields to:

- `Trip`
- `TripSegment`

Keep values nullable only where needed for migration/import fallback.

### 3. Storage Reads/Writes

Update:

- `trips-storage.ts`
- `trip-segments-storage.ts`
- `trip-points-storage.ts`

New writes should update stats columns directly.

`loadTripStatsByTripLocalIds` and `loadTripSegmentStatsByTripLocalIds` can become compatibility helpers that read from entity columns instead of stats tables.

### 4. Clarify Single vs Batch APIs

Keep batch helpers for import/migration:

- `refreshTripStatsForTripLocalIds(tripLocalIds: string[])`
- `refreshTripSegmentStatsForTripLocalIds(tripLocalIds: string[])`

Add single-trip wrappers for recording flow:

- `refreshTripStatsForTripLocalId(tripLocalId: string)`
- `refreshTripSegmentStatsForTripLocalId(tripLocalId: string)`

Recording should use the single-trip wrappers.

Import/migration/repair should use batch helpers.

### 5. Settings Backfill Action

Add temporary Settings action:

- `Send stats data`

Behavior:

- find synced local trips with server IDs
- read stats from `trips` and `trip_segments`
- if stats are missing locally, calculate them locally once
- send stats to backend
- show success/failure count

This action is only for existing backend trips that were synced before backend stats fields existed.

## Backend Refactor

### 1. Prisma Migration

Add stats columns to `trips` and `trip_segments`.

Do not add separate stats tables.

### 2. DTOs

Add stats DTOs to:

- trip sync
- stats sync endpoint
- owned trip detail
- shared trip detail

### 3. Store Mobile-Provided Stats

During normal trip sync:

- store trip stats if present
- store segment stats by `segmentLocalId`

During `POST /trips/:tripId/stats/sync`:

- require ownership
- update only the target trip and its segments
- do not calculate stats from points

### 4. Return Stored Stats

Owned and shared trip APIs should return stored stats.

If stats are null for legacy data, return null and let mobile fallback calculate when importing.

## Edge Cases

### Deleted or Missing Segments

If a segment stat references an unknown `segmentLocalId`, backend should ignore that stat or reject the payload with a clear validation error.

Prefer ignoring unknown segment stats during legacy backfill to avoid blocking the whole trip.

### Local-Only Trips

Local-only trips still calculate stats on mobile and store them locally.

No backend call is needed until sync.

### Edited Trips

If user edits points/segments locally:

- update local stats columns
- mark trip/segments as pending sync
- send updated stats on next sync

### Shared Trips

Shared trip stats are read-only snapshots from the owner.

Recipient import should not mark stats as pending sync.

## Acceptance Criteria

- New mobile recordings store trip and segment stats directly on `trips` and `trip_segments`.
- Recording flow updates stats for only the active trip through single-trip helpers.
- Import/restore can process many trips with batch helpers.
- Backend stores mobile-provided trip stats without recalculating them.
- Backend returns stored stats for owned and shared trips.
- Mobile restore/import uses backend stats when available.
- Mobile calculates stats only as fallback when backend stats are missing.
- Temporary Settings action can send stats for existing synced trips.
- Trip list and route screen show the same totals before and after restore.

## Non-Goals

- No backend route map matching.
- No backend distance recalculation from raw points during normal sync.
- No historical stats versions.
- No separate stats tables unless a later requirement introduces stats history or multiple stats algorithms.
