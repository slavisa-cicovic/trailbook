# PLAN 43: Long-Gap-Aware Trip Point Recovery

## Goal

Prevent route loss after real-world pauses or long background gaps by making trip point acceptance aware of large time gaps between accepted points.

## Problem

`PLAN_41` and `PLAN_42` diagnostics now show a clear pattern:

- both iOS and Android continue to receive many location callbacks
- after a long gap, the first resumed point is often rejected as `jump-distance`
- Android is affected more severely, but the same pattern appears on iOS

This means the problem is not only raw callback delivery.
It is also the way the current point filter treats the first point after a long real-world pause.

Example real-world scenario:
- user pauses movement for `20 min`
- app has no accepted trip point during that interval
- first point after movement resumes is far away from the last accepted point
- filter treats it as a suspicious jump and rejects it
- recovery never happens or happens too late

## Non-goals

- Do not globally relax jump-distance filtering for all normal movement.
- Do not remove diagnostics.
- Do not redesign auto mode in this slice.
- Do not implement full explicit pause semantics for every stationary period.

## Product decision

Treat the first point after a sufficiently long time gap as a recovery candidate, not as a normal continuity point.

This should allow the route to resume after:
- traffic stops
- coffee / lunch stops
- border waits
- temporary background throttling

without opening the floodgates to arbitrary GPS spikes during normal continuous movement.

## Definitions

Introduce a `long gap` threshold based on elapsed time between:
- the last accepted trip point
- the next candidate point

Recommended V1 threshold:
- `>= 5 minutes`

Introduce a stricter `very long gap` threshold if needed:
- `>= 15 minutes`

These thresholds may later become mode-aware, but V1 can start shared.

## Proposed behavior

### Normal case

If the gap since the last accepted point is below the threshold:
- keep current filtering unchanged

### Long-gap recovery case

If the gap since the last accepted point is at or above the threshold:
- do not apply normal `jump-distance` logic to the first resumed point
- instead treat that point as a recovery anchor candidate

Recommended V1 rule:
- if accuracy is still within allowed limits
- and implied speed is not absurd for the mode
- accept the point even if jump distance is large

In other words:
- long-gap recovery should bypass `jump-distance`
- but not bypass all sanity checks

### Recovery stabilization

After accepting the first post-gap point:
- resume normal filtering for subsequent points

No special recovery state should persist longer than one accepted point in V1.

## Why this is safe

This is much safer than weakening jump filtering globally because:
- it only applies after a large real time gap
- it is targeted at realistic pause/resume behavior
- continuous movement still uses the existing stricter filter

## Mobile implementation

### 1. Detect long gaps

In `trip-points.service.ts`, compute:
- time delta between `previousPoint.recordedAt` and `nextTripPoint.recordedAt`

Add helpers such as:
- `getElapsedSeconds(...)`
- `isLongGap(...)`

### 2. Add recovery branch in point filtering

Inside `appendTripPointIfUseful(...)`:
- after duplicate and accuracy checks
- before rejecting on `jump-distance`

If `isLongGap(...)`:
- allow recovery acceptance under a narrower rule set

Suggested order:
1. duplicate checks
2. accuracy check
3. compute elapsed time
4. if long gap:
   - use recovery acceptance logic
5. otherwise:
   - use existing normal path

### 3. Record diagnostics explicitly

Add new diagnostics reason(s) to distinguish recovery from ordinary accepts.

Recommended new reason:
- `accepted-after-long-gap`

Optional additional reason:
- `rejected-after-long-gap`

This is important so PostgreSQL diagnostics can confirm whether the new branch is being used.

### 4. Persist/sync diagnostics changes

Because `PLAN_42` now syncs diagnostics:
- extend diagnostics DTO/storage/schema as needed for the new counters

Do not add raw event complexity beyond what is necessary.

## Server changes

If new diagnostics counters are added:
- extend `SyncTripDto.diagnostics`
- extend `trip_diagnostics` schema
- extend sync upsert logic
- extend tests

If diagnostics changes are kept inside recent event samples only, no schema change is needed.

## Validation strategy

Re-run pause-heavy real-world tests:
- one with a `5 min` stop
- one with a `20 min` stop
- both on Android and iOS

Expected result:
- first post-gap point should survive
- route should continue after the pause
- `jump-distance` reject count should drop specifically after long gaps

## Risks

### Risk: accepting a real GPS teleport

Mitigation:
- keep accuracy check
- keep implied-speed sanity check
- only bypass jump-distance after a large gap

### Risk: too many false recoveries

Mitigation:
- start with one-point recovery only
- avoid a long-lived recovery mode in V1

## Expected outcome

After a pause or large callback gap:
- route resumes instead of disappearing
- Android should recover more often after stops
- iOS should also stop losing tail sections after long pauses

## Relevant existing code

- `mobile/src/services/trip-points/trip-points.service.ts`
- `mobile/src/services/trip-points/trip-point-diagnostics.service.ts`
- `mobile/src/services/recording/background-recording-task.ts`
- `mobile/src/screens/recording/recording-screen.tsx`
- `mobile/src/services/trips/server-trip-sharing.service.ts`
- `server/src/trips/dto/sync-trip.dto.ts`
- `server/src/trips/trips.service.ts`
- `server/prisma/schema.prisma`
