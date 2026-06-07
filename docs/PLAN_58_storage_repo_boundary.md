# PLAN 58: Storage / Repository Boundary Cleanup

## Goal

Remove non-persistence logic from storage files.

After this plan, storage files do one thing: read rows from the database and write
rows to the database. Repositories own domain interfaces, ID generation, business
rules, and aggregation read models.

## Current State

16 repository files exist. 13 are pure pass-throughs with zero real content.
5 storage files contain logic that clearly belongs in the repository layer:

| Storage file | What does not belong there |
|---|---|
| `sync-outbox-storage.ts` | `SyncOutboxItem` interface, type exports, `createSyncOutboxId`, `enqueueSyncOutboxItem`, `loadSyncOutboxSummary` |
| `recording-native-events-storage.ts` | `RecordingNativeEventSummary` interface, `createRecordingNativeEventLocalId`, `appendRecordingNativeEvent`, `loadRecordingNativeEventSummary` |
| `trip-route-variants-storage.ts` | `TripRouteVariantSummary` interface, `loadTripRouteVariantSummary` |
| `trips-storage.ts` | `normalizeTrip`, `inferTripStatus` |
| `trip-segments-storage.ts` | `normalizeTripSegment` |
| `waypoints-storage.ts` | `normalizeWaypoint` |
| `waypoint-attachments-storage.ts` | `normalizeWaypointAttachment` |
| `recording-storage.ts` | `normalizeRecordingSession` |

## Non-Goals

- Do not change any behavior visible to callers.
- Do not move row↔domain mapping helpers (`toXFromRow`, `toXRow`) — these are
  tightly coupled to the Drizzle schema and belong in storage.
- Do not touch hot-path raw SQL in `raw-location-events-storage.ts` or
  `trip-points-storage.ts`.
- Do not change AsyncStorage migration logic.
- Do not change the `areTripSegmentsEqual` diff optimization in
  `trip-segments-storage.ts` — it is an internal write optimization, not business logic.
- Do not move `refreshTripStatsForTripLocalIds` side effects out of
  `trip-segments-storage.ts` in this plan (that is a larger coordination refactor).

## Boundary Rule (after this plan)

```
storage:
  DB queries (select, insert, update, delete)
  Row ↔ domain type mapping (toXFromRow, toXRow)
  JSON serialize / deserialize
  AsyncStorage migration
  Smart upsert optimizations (internal)

repository:
  Domain interface and type exports (what callers import)
  ID generation (createXLocalId, createXId)
  Domain-level construction (enqueueSyncOutboxItem = create id + call storage)
  Aggregation read models (loadXSummary, loadXCounts)
  normalize functions (default values, enum normalization, status inference)
```

---

## Phase 1: Outbox, Native Events, Route Variants

These three storage files have aggregation functions and ID generation that are
unambiguously out of place.

### 1A — `sync-outbox-storage.ts` → `sync-outbox-repository.ts`

**Move to repository:**

- `SyncOutboxItem` interface + `SyncOutboxEntityType`, `SyncOutboxOperation`,
  `SyncOutboxStatus` type exports
- `createSyncOutboxId()`
- `enqueueSyncOutboxItem()` — it generates the ID and constructs the domain object;
  it calls a new thin storage function (see below)
- `loadSyncOutboxSummary()`

**Storage keeps:**

- `markSyncOutboxItemRunning`, `markSyncOutboxItemSucceeded`, `markSyncOutboxItemFailed`,
  `loadPendingSyncOutboxItems` — these are direct DB state-change operations
- New thin internal function: `upsertSyncOutboxRow(row)` — raw insert/onConflictDoUpdate,
  called by `enqueueSyncOutboxItem` in the repository

**Callers:** All callers already import through `sync-outbox-repository.ts`
(it currently re-exports storage). After this change the re-export becomes real
content. No caller paths change.

### 1B — `recording-native-events-storage.ts` → `recording-native-events-repository.ts`

**Move to repository:**

- `RecordingNativeEventSummary` interface
- `createRecordingNativeEventLocalId()`
- `appendRecordingNativeEvent()` — constructs the domain event and calls storage
- `loadRecordingNativeEventSummary()` — in-memory grouping and sort, not a raw query

**Storage keeps:**

- `loadRecentRecordingNativeEvents()`
- New thin internal: `insertRecordingNativeEventRow(row)` — the raw insert, called
  by `appendRecordingNativeEvent` in the repository

### 1C — `trip-route-variants-storage.ts` → `trip-route-variants-repository.ts`

**Move to repository:**

- `TripRouteVariantSummary` interface
- `loadTripRouteVariantSummary()` — in-memory count aggregation after a select,
  not a DB-level concern

**Storage keeps:**

- `loadTripRouteVariantsForTrip`, `saveTripRouteVariants`

### Phase 1 Acceptance Criteria

- `sync-outbox-storage.ts` contains no exported interfaces or types visible to
  callers outside the storage layer.
- `recording-native-events-storage.ts` has no `RecordingNativeEventSummary` interface
  and no `createRecordingNativeEventLocalId` function.
- `trip-route-variants-storage.ts` has no `TripRouteVariantSummary` interface and
  no `loadTripRouteVariantSummary` function.
- All three repository files are real modules, not pass-throughs.
- `npm run typecheck --workspace mobile` passes.
- `npm test --workspace mobile` passes.

---

## Phase 2: Normalize Functions

`normalizeTrip`, `normalizeTripSegment`, `normalizeWaypoint`,
`normalizeWaypointAttachment`, `normalizeRecordingSession` currently live in storage
but encode application-level rules: what is the default title, how to infer `status`
from `endedAt`, what is the default waypoint category, how to handle legacy
`isRecording` field.

These functions already import from `../constants/` (recording profiles, waypoint
categories, motion activity normalizers). Moving them to a domain-adjacent location
requires no new dependencies.

### Approach

Create normalize helpers in a shared location that both storage and repositories can
import:

```
mobile/src/domain/normalize-trip.ts          (normalizeTrip, inferTripStatus)
mobile/src/domain/normalize-trip-segment.ts  (normalizeTripSegment)
mobile/src/domain/normalize-waypoint.ts      (normalizeWaypoint)
mobile/src/domain/normalize-recording-session.ts  (normalizeRecordingSession)
```

Storage `toXFromRow` functions call these normalizers (same as today — only the
import path changes). Repositories and other callers that need normalization also
import directly from domain.

`normalizeWaypointAttachment` (currently in `waypoint-attachments-storage.ts`) is
similar: move to `mobile/src/domain/normalize-waypoint-attachment.ts`.

### Why domain, not repository

Storage files need to normalize when loading from DB (`toTripFromRow` calls
`normalizeTrip`). If normalize functions were in a repository, storage would import
from a repository, which inverts the dependency. Domain is a neutral layer that both
storage and repositories can safely import from.

### Phase 2 Acceptance Criteria

- No `normalizeX` function defined in any file under `storage/`.
- `storage/trips-storage.ts` imports `normalizeTrip` from `../domain/normalize-trip`.
- `storage/trip-segments-storage.ts` imports `normalizeTripSegment` from domain.
- `storage/waypoints-storage.ts` imports `normalizeWaypoint` from domain.
- `storage/waypoint-attachments-storage.ts` imports `normalizeWaypointAttachment` from domain.
- `storage/recording-storage.ts` imports `normalizeRecordingSession` from domain.
- `npm run typecheck --workspace mobile` passes.
- `npm test --workspace mobile` passes.

---

## Implementation Notes

Implemented:

- **Phase 1A** (`sync-outbox`): Removed `createSyncOutboxId`, `enqueueSyncOutboxItem`,
  `loadSyncOutboxSummary` from storage. Added thin `insertOrRefreshSyncOutboxRow` and
  `loadSyncOutboxStatusRows`. Rewrote repo with real business logic.

- **Phase 1B** (`recording-native-events`): Removed `createRecordingNativeEventLocalId`,
  `appendRecordingNativeEvent`, `loadRecordingNativeEventSummary`,
  `RecordingNativeEventSummary` from storage. Added thin `insertRecordingNativeEventRow`
  and `loadRecordingNativeEventProjection`. Rewrote repo with real logic.

- **Phase 1C** (`trip-route-variants`): Removed `TripRouteVariantSummary` and
  `loadTripRouteVariantSummary` from storage. Added thin `loadTripRouteVariantSummaryRows`.
  Rewrote repo with real aggregation logic.

- **Phase 2**: Created four domain normalize files:
  `domain/normalize-trip.ts`, `domain/normalize-trip-segment.ts`,
  `domain/normalize-waypoint.ts`, `domain/normalize-recording-session.ts`.
  Updated storage imports (`trips-storage`, `trip-segments-storage`,
  `waypoints-storage`, `recording-storage`). `normalizeWaypointAttachment` stays in
  `waypoint-attachments-storage.ts` (depends on `resolveStoredPhotoUri` service).

- Updated two test files that imported directly from storage:
  `sync-observability-storage.test.ts` and `trip-pauses-route-variants-storage.test.ts`.

Verification:

```bash
npm run typecheck --workspace mobile   # passed
npm test --workspace mobile            # 176/176 passed (27 files)
npm run lint --workspace mobile        # 0 errors, 6 pre-existing warnings
```

## Verification

After each phase:

```bash
npm run typecheck --workspace mobile
npm test --workspace mobile
npm run lint --workspace mobile
```

Manual smoke:
- Start recording (exercises recording-storage, trip-segments-storage, sync-outbox)
- Stop recording (exercises all of the above + native events)
- Open trip list (exercises trips-storage, waypoints-storage)

## Risks

- **Phase 1**: Callers of `appendRecordingNativeEvent` exist in multiple services.
  After the move, if any caller imports directly from storage instead of repository,
  the function will not be there. Audit imports before implementing.
- **Phase 2**: `normalizeRecordingSession` handles a legacy `isRecording` field from
  old AsyncStorage data. Moving it to domain does not change behavior but the
  migration path must remain intact (storage still calls normalize when loading).
- **Phase 2**: `normalizeTripSegment` and `normalizeTrip` are called both from
  `toXFromRow` (load path) and from `loadLegacyXFromAsyncStorage` (migration path).
  Both call sites must be updated.

## Future Work (not in this plan)

`saveTripSegments` in `trip-segments-storage.ts` calls
`refreshTripSegmentStatsForTripLocalIds` as a side effect. That coordination belongs
in a service or repository write path, not in storage. Separating it is a larger
refactor that requires auditing all segment write call sites.
