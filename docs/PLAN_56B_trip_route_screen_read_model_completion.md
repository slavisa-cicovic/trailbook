# PLAN 56B: Trip Route Screen Read Model Completion

## Goal

Finish migrating `trip-route-screen.tsx` toward `getTripRouteScreenModel` so the screen no longer manually composes route read data from multiple stores/repositories.

This continues `PLAN_55`, where the route screen started using the read model for route points and segment stats.

## Current State

`trip-route-screen.tsx` still derives much of its read data locally:

- current user trips/groups/members/segments/pauses/waypoints/attachments
- selected trip
- group-aware trip navigation
- selected waypoints and attachment previews
- selected segment summaries and timeline entries

Some of this is UI state and can stay in the screen. But persistence-facing read composition should move into repository/use-case models.

## Non-Goals

- Do not change route screen UI design.
- Do not change segment edit behavior.
- Do not change raw reprocessing behavior.
- Do not remove Zustand stores.
- Do not change trip group semantics.

## Phase 1: Expand Route Read Model

### Tasks

Extend `TripRouteScreenModel` with fields currently composed in the screen:

- `displayTripSegments`
- `selectedTripSegments`
- `selectedTripPauses`
- `selectedTripTimeline`
- `selectedTripWaypoints`
- `selectedTripAttachments`
- `waypointMarkers`
- `routeCoordinates`
- `segmentPolylines`
- `fallbackCoordinates`

Keep UI-only details in the screen:

- map type
- modal visibility
- edit drafts
- busy/loading flags
- animations

### Acceptance Criteria

- The repository returns a complete route display model.
- The screen no longer needs to import low-level composition helpers just to render route details.

## Phase 2: Preserve Group-Aware Navigation

### Tasks

1. Use `TripRouteScreenModel.navigation` as the source of prev/next trip IDs.
2. Keep URL generation in the screen.
3. Preserve group context:
   - when opened from a group, prev/next walks through that group order
   - otherwise prev/next walks through global visible trips

### Acceptance Criteria

- Prev/next trip behavior remains unchanged.
- Missing/deleted trips are skipped.

## Phase 3: Route Screen Migration

### Tasks

1. Replace local selected-trip derivations with the model.
2. Keep store arrays only for mutation commands:
   - edit trip metadata
   - edit segment mode
   - raw reprocessing apply reload
   - sync status updates
3. Make one local `refreshRouteModel()` function for after mutations.

### Acceptance Criteria

- Route screen renders from one model for read data.
- Mutations still update local stores and refresh model when needed.
- Route loading state remains correct.

## Phase 4: Tests

### Tasks

Add repository tests for:

- selected trip not found
- group navigation fallback when group is missing
- ended trip with active segment finalization display
- waypoint marker first photo selection
- timeline ordering

### Acceptance Criteria

- Route read model behavior is covered without rendering React Native screen tests.

## Verification

Run:

```bash
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run lint --workspace mobile
```

Manual checks:

- Open route from trips list.
- Open route from trip group.
- Use prev/next trip buttons.
- Open details bottom sheet.
- Edit trip title.
- Edit segment mode.
- Run raw reprocessing preview/apply on an ended trip with raw events.

## Risks

- Route screen currently mixes read model and command state. Moving too much at once can cause stale UI after mutations.
- Segment finalization display currently runs in the screen and may need to become repository/use-case logic.
- Route map performance should not regress by rebuilding large arrays more often than before.

## Rollout

Migrate in small commits:

1. expand repository model and tests
2. switch read-only display fields
3. switch navigation
4. add refresh-after-mutation helper
5. remove now-unused screen imports/helpers

## Implementation Notes

Implemented:

- Expanded `getTripRouteScreenModel` to return route coordinates, fallback coordinates, segment polylines, selected waypoints, selected attachments, waypoint markers, pauses, timeline entries and display-safe segments.
- Moved group-aware prev/next navigation into the route read model, including the effective `groupLocalId` used by the screen URL builder.
- Migrated `trip-route-screen.tsx` to render route read data from `TripRouteScreenModel` and keep stores only for mutation/reload flows.
- Added `refreshRouteModel()` after trip edit, segment mode edit and raw reprocessing apply.
- Changed `trips-repository` storage access to lazy wrappers/dynamic imports so importing repository read models does not eagerly load native SQLite modules.
- Extended repository tests for selected waypoints, first photo marker selection, deleted attachment filtering, timeline ordering and group-aware navigation context.

Verification:

```bash
npm run test --workspace mobile -- trips-repository
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run lint --workspace mobile
```

Result:

- Targeted repository test passed.
- Typecheck passed.
- Full test suite passed.
- Lint passed with existing warnings in `_layout.tsx` and `waypoint-photo-viewer-screen.tsx`.
