# PLAN 56A: Waypoint Read Model Screen Migration

## Goal

Make waypoint detail and waypoint photo screens consume repository read models instead of manually joining trips, waypoints, attachments and route points from stores/storage.

This continues `PLAN_55` by using the read models already introduced in:

- `mobile/src/repositories/waypoints-repository.ts`
- `getWaypointScreenModel`
- `getWaypointPhotoViewerModel`

## Current State

`PLAN_55` added waypoint read-model APIs and tests, but the screens still compose most data themselves:

- `trip-waypoint-screen.tsx`
  - filters trips from store
  - filters waypoints from store
  - calculates prev/next waypoint locally
  - filters attachments locally
- `trip-waypoint-photo-screen.tsx`
  - filters trips, waypoints and attachments locally
  - loads route points directly
  - calculates next/previous photo waypoint locally

This keeps UI behavior working, but leaves duplicated composition logic outside the repository layer.

## Non-Goals

- Do not change waypoint UI layout.
- Do not change photo viewer gestures or transition behavior.
- Do not change attachment create/delete flows.
- Do not change Zustand store hydration.
- Do not remove local store writes for edit/delete operations yet.

## Phase 1: Migrate Photo Viewer Data Loading

### Tasks

1. Update `trip-waypoint-photo-screen.tsx` to call `getWaypointPhotoViewerModel`.
2. Use the model for:
   - selected trip title
   - selected waypoint title and coordinate
   - visible attachments
   - route preview coordinates
   - next/previous waypoint-with-photos navigation
3. Keep local `waypointAttachments` store only for delete mutation and immediate UI state.
4. Preserve existing redirect behavior when trip/waypoint/photo data is unavailable.

### Acceptance Criteria

- Photo viewer behavior remains unchanged.
- Route overlay still renders full trip route and waypoint marker.
- Scroll past start/end still navigates to the expected neighboring waypoint photo.
- Deleting current photo still falls back to next/previous photo or exits.

## Phase 2: Migrate Waypoint Detail Data Loading

### Tasks

1. Update `trip-waypoint-screen.tsx` to call `getWaypointScreenModel`.
2. Use the model for:
   - selected trip
   - selected waypoint
   - visible attachments
   - prev/next waypoint navigation
3. Keep store-derived arrays available only for mutations:
   - editing waypoint metadata
   - adding/removing attachments
   - demo photo limit checks
4. Avoid changing the current carousel, selection mode and add-photo UI.

### Acceptance Criteria

- Waypoint screen still shows the same title/category/note/photos.
- Prev/next waypoint order remains chronological by waypoint `createdAt`.
- Deleted waypoints and attachments remain hidden.
- Demo photo limit behavior remains unchanged.

## Phase 3: Repository Tests

### Tasks

1. Extend waypoint repository tests if screen migration reveals missing fields.
2. Add regression tests for:
   - no attachments
   - selected attachment missing/deleted
   - neighboring waypoints without photos are skipped
   - user scoping

### Acceptance Criteria

- Repository tests cover all data needed by migrated screens.

## Verification

Run:

```bash
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run lint --workspace mobile
```

Manual checks:

- Open waypoint detail with multiple photos.
- Navigate prev/next waypoint.
- Open photo viewer.
- Swipe from last/first photo to neighboring waypoint.
- Delete photo and verify fallback navigation.

## Risks

- The screens currently depend on live store values for immediate UI updates after mutations.
- Repository models load from persistence, so after a local mutation we may need to refresh the model or continue using store state for mutation-sensitive parts.
- Photo waypoint navigation direction names are historically easy to invert; preserve existing behavior exactly.

## Rollout

Do this screen by screen:

1. migrate `trip-waypoint-photo-screen.tsx`
2. verify photo transitions
3. migrate `trip-waypoint-screen.tsx`
4. verify add/edit/delete photo flows

## Implementation Notes

Implemented in this pass:

- `trip-waypoint-photo-screen.tsx` now loads `getWaypointPhotoViewerModel`.
- Photo viewer now receives trip title, waypoint title/coordinate, route coordinates, attachments and neighboring photo waypoint metadata from the repository read model.
- Photo delete fallback still uses current visible model attachments and the existing store mutation.
- `trip-waypoint-screen.tsx` now loads `getWaypointScreenModel`.
- Waypoint detail now receives selected trip, selected waypoint, visible attachments and prev/next waypoint ids from the repository read model.
- Store arrays remain in the screen for edit/add/delete photo mutations and demo photo limit checks.

Verification run:

```bash
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run lint --workspace mobile
```

Result:

- Typecheck passed.
- Tests passed: `23` files, `130` tests.
- Lint passed with existing warnings unrelated to this plan.
