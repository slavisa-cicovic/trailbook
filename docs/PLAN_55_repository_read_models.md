# PLAN 55: Repository Read Models And Domain Boundaries

## Goal

Move the mobile repository layer from mostly thin storage re-exports toward real application-facing read/write models.

The target architecture is:

```text
screen/controller/service
  -> repository or use-case
    -> storage data access
    -> domain transforms / aggregation
    -> screen/use-case friendly model
```

Storage should remain mostly data access. Repositories should own persistence-facing business composition.

## Current State

After `PLAN_52` and `PLAN_53`:

- Storage implementation is clearer:
  - Drizzle-backed stable storage
  - raw SQL hot path for `trip_points` / `raw_location_events`
  - legacy migrations still intentionally present
- Repository boundary exists and is documented.
- Many repository files are still intentionally thin re-exports.
- Some screens/services still compose multiple storage/repository calls directly.

Examples:

- `trips-screen` already uses `listTripSummaryStats`, which is a repository-level read model primitive.
- `trip-route-screen` manually loads trips, segments, waypoints and points in several places.
- `recording-screen` / controller directly load trip points for active trip state.
- `raw-event-reprocessing.service.ts` composes trips, segments, points, waypoints and raw events internally.
- `calculateTripDistanceMeters` currently lives in `trip-points-storage.ts`, but it is a pure domain calculation, not storage.

## Non-Goals

- Do not rewrite all repositories at once.
- Do not introduce a heavy application service framework.
- Do not move hot-path SQL out of storage.
- Do not change screen UI behavior.
- Do not change sync protocol.
- Do not move every direct storage import; session/config/theme/debug paths can stay pragmatic.

## Architectural Rules

### Storage

Storage modules should own:

- table reads/writes
- row mapping
- persistence-level transactions
- raw SQL or Drizzle implementation details

Storage modules should avoid:

- screen-specific DTOs
- multi-screen read models
- business naming that is not persistence-related

### Repository

Repositories should own:

- loading multiple tables for one use case
- filtering deleted/active records consistently
- sorting and grouping
- stats/domain aggregation
- transformation into screen/use-case friendly models
- composing raw SQL and Drizzle-backed storage without leaking that detail

Thin re-export repositories are acceptable temporarily, but each time a screen/service needs multiple storage calls, prefer adding a repository read/write model.

### Domain Services

Pure calculations should live in domain/service modules, not storage.

Example:

- `calculateTripDistanceMeters` should move to a domain service such as:

```text
mobile/src/services/trips/trip-distance.service.ts
```

Storage can import this pure function when refreshing stats, but storage should not be the source of truth for the calculation.

## Phase 1: Extract Pure Trip Distance Domain Service

### Tasks

1. Move `calculateTripDistanceMeters` out of `trip-points-storage.ts`.
2. Create a pure service module, for example:

```text
mobile/src/services/trips/trip-distance.service.ts
```

3. Update callers:
   - `trip-points-storage.ts`
   - `recording-processor.service.ts`
   - any tests importing from storage only for distance calculation
4. Keep function behavior exactly the same.

### Acceptance Criteria

- No behavior change.
- Tests covering distance still pass.
- Storage no longer exports pure distance calculation as its public API.

## Phase 2: Trip Route Read Model Repository

### Goal

Stop `trip-route-screen` from manually composing low-level trip data.

### Proposed API

Add to `trips-repository.ts` or a new `trip-route-repository.ts`:

```ts
interface TripRouteScreenModel {
  trip: Trip;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
  tripStats: TripSummaryStats | null;
  navigation: {
    nextTripLocalId: string | null;
    previousTripLocalId: string | null;
  };
}

async function getTripRouteScreenModel(input: {
  groupLocalId?: string | null;
  tripLocalId: string;
}): Promise<TripRouteScreenModel | null>;
```

The repository should own:

- loading all needed tables
- filtering deleted trips/waypoints
- sorting segments/points
- choosing navigation order for group vs global trips
- attaching stats summary

### Acceptance Criteria

- `trip-route-screen` calls one repository function for its main model.
- Existing prev/next trip behavior remains unchanged.
- Existing route display behavior remains unchanged.

## Phase 3: Trips List Read Model Repository

### Goal

Make `trips-screen` consume screen-ready list models instead of joining trip stats in the screen.

### Proposed API

```ts
interface TripsListItem {
  trip: Trip;
  stats: TripSummaryStats | null;
  groupInfo: {
    groupCount: number;
    primaryGroupTitle: string | null;
  };
}

async function listTripsScreenItems(input: {
  includeDeleted?: boolean;
  userId?: string | null;
}): Promise<TripsListItem[]>;
```

Keep selection/grouping UI state in the screen. Move data composition to repository.

### Acceptance Criteria

- `trips-screen` no longer manually calls `listTripSummaryStats`.
- Sorting/filtering behavior remains the same.
- Group badges still render correctly.

## Phase 4: Waypoint/Photo Read Models

### Goal

Centralize waypoint photo viewer and waypoint detail data loading.

### Proposed APIs

```ts
async function getWaypointScreenModel(input: {
  tripLocalId: string;
  waypointLocalId: string;
}): Promise<WaypointScreenModel | null>;

async function getWaypointPhotoViewerModel(input: {
  selectedAttachmentId: string;
  tripLocalId: string;
  waypointLocalId: string;
}): Promise<WaypointPhotoViewerModel | null>;
```

Repository owns:

- waypoint ordering
- attachment filtering
- route/point overlay data
- trip title / waypoint title data

### Acceptance Criteria

- waypoint screens stop manually joining trip/waypoint/attachment/point data.
- Prev/next waypoint behavior remains unchanged.
- Photo viewer overlay behavior remains unchanged.

## Phase 5: Recording/Reprocessing Use-Case Boundary

### Goal

Keep low-level recording pipeline pragmatic, but isolate larger multi-table workflows.

Candidates:

- raw event reprocessing build/apply workflow
- current active route model for recording screen
- trip resume model

These may be better as use-case services rather than repositories if they contain workflow logic.

Proposed split:

```text
repositories:
  load/save/aggregate persistence data

services/use-cases:
  orchestrate commands/workflows
```

### Acceptance Criteria

- reprocessing service can use repository models rather than loading each table directly
- recording screen controller can request active-route model through one function
- no recording hot-path behavior change

## Phase 6: Repository Tests

Add tests at repository/read-model level:

- route model includes sorted segments/points
- group navigation respects group context
- trips list stats are attached correctly
- waypoint photo model filters deleted attachments
- distance calculation remains unchanged after moving to domain service

Prefer unit tests with mocked storage where practical. Use integration-style storage tests only where SQL behavior matters.

## Rollout Strategy

Do this incrementally:

1. Move pure distance calculation.
2. Add route read model repository.
3. Migrate one screen to it.
4. Add tests.
5. Repeat for trips list and waypoint/photo models.

Do not convert all repositories in one commit.

## Acceptance Criteria For The Plan

- Storage is mostly data access.
- Repository layer owns real read models for trip route, trips list and waypoint/photo screens.
- Pure domain calculations are not exported from storage.
- Existing UI behavior remains unchanged.
- Full checks pass after each phase:

```bash
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run lint --workspace mobile
```

## Implementation Notes

Implemented in this pass:

- Extracted `calculateTripDistanceMeters` into `mobile/src/services/trips/trip-distance.service.ts`.
- Kept a compatibility re-export from `trip-points.service.ts` while moving direct callers to the new domain service.
- Added `getTripRouteScreenModel` to `trips-repository.ts`.
- Switched `trip-route-screen` route points and segment stats loading to the route read model.
- Added `listTripsScreenItems` to `trips-repository.ts`.
- Switched `trips-screen` stats loading to the trips list read model.
- Added `getWaypointScreenModel` and `getWaypointPhotoViewerModel` to `waypoints-repository.ts`.
- Added repository read-model tests for trips and waypoints.

Intentionally left for later, smaller UI-focused increments:

- Fully replacing remaining route screen store-derived UI state with `TripRouteScreenModel`.
- Fully replacing waypoint/photo screen store-derived UI state with waypoint read models.
- Moving raw-event reprocessing table composition behind a dedicated use-case/repository boundary.

## Risks

- Repository read models can become too screen-specific and duplicate UI state.
- Moving composition out of screens can accidentally change sorting/filtering.
- Over-eager refactoring can create large diffs and hidden behavior changes.

Mitigation:

- migrate one screen/model at a time
- write repository tests before switching screens where possible
- keep UI-only state in screens
- keep command/workflow orchestration in services/use-cases, not repositories
