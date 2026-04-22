# PLAN 45: Trip Point Recovery And Spike Control

## Goal

Improve recorded route geometry by making trip point acceptance safer around:
- session start
- explicit resume
- interrupted-session recovery
- short GPS teleports that create visible fake diagonals

The focus is:
- fewer physically implausible route shapes
- fewer early-session distortions
- fewer single-point spikes

This plan extends the current point filtering pipeline.
It does not replace it.

## Problem

`PLAN_32` introduced basic GPS point quality filtering.
`PLAN_41` and `PLAN_42` improved callback and rejection observability.
`PLAN_43` adds long-gap-aware recovery.

That still leaves an important class of route-shape failures:

- the first accepted point after start can be unstable
- the first accepted point after resume can create a bad branch
- interrupted-session recovery can reconnect badly
- one short-lived bad fix can create a fake diagonal across fields, blocks, or water

These failures are especially damaging because:
- they are visually obvious
- they affect user trust more than small distance inaccuracies
- they often come from only one or two bad accepted points

## Product Principle

It is better to delay acceptance of a suspicious continuity point than to persist obviously wrong route geometry.

For Trailbook:
- a slightly simplified path is acceptable
- a short delay before route continuation is acceptable
- a visibly fake shortcut is not acceptable

## Non-goals

- Do not add road snapping or map matching.
- Do not introduce a large live route reconstruction engine.
- Do not move geo logic into UI components.
- Do not redesign trip segments or auto mode in this slice.
- Do not replace `PLAN_33` post-recording smoothing.
- Do not remove the existing diagnostics pipeline.

## Product decision

Extend live point filtering with two targeted mechanisms:

1. recovery-context-aware acceptance
- treat early session and resume points more carefully than ordinary continuity points

2. short-spike control
- detect and remove small clusters of points that create obviously fake geometry

The intent is:
- improve raw persisted geometry before rendering
- preserve the current architecture
- keep the logic deterministic and debuggable

## Relationship To Existing Plans

### PLAN 32

Keep the current filtering layer and thresholds as the foundation.
This plan adds narrower logic on top of that layer.

### PLAN 41 / PLAN 42

All new acceptance or rollback branches must be visible in diagnostics.
This plan depends on explicit decision reasons, not silent heuristics.

### PLAN 43

Long-gap recovery remains valid.
This plan generalizes the same product direction to other high-risk continuity moments:
- session start
- explicit resume
- interrupted-session continuation

### PLAN 33

Post-recording smoothing remains a separate explicit cleanup action.
This plan is about preventing bad live points from entering storage in the first place.

## Proposed behavior

## 1. Recovery-context-aware acceptance

### Why

The first accepted point after:
- recording start
- manual resume
- interrupted-session continuation
- long callback gap

should not be treated exactly like an ordinary continuity point.

These points are more likely to be:
- stale
- low-confidence
- displaced by first-fix instability
- visually destructive if accepted incorrectly

### Recovery contexts

Introduce a small internal classification for candidate points:

- `normal`
- `early-session`
- `after-resume`
- `after-interruption`
- `after-long-gap`

This classification should remain internal to the point filtering service.
It should not become a new persisted domain entity in V1.

### Rules

For all recovery contexts:
- keep duplicate checks
- keep accuracy checks
- keep implied-speed sanity checks

Do not globally weaken filtering.

Instead:
- allow a controlled bypass of strict continuity rules only where appropriate
- make acceptance depend on narrower recovery-specific logic

Recommended V1 behavior:
- `after-long-gap`
  - keep `PLAN_43` behavior
- `early-session`
  - be conservative with large first jumps
  - prefer waiting for confirmation if the point is suspicious
- `after-resume` / `after-interruption`
  - allow route recovery
  - but do not immediately trust a single geometrically suspicious point

### Diagnostics

Add explicit decision reasons such as:
- `accepted-early-session`
- `accepted-after-resume`
- `accepted-after-interruption`
- optional:
  - `rejected-early-session`
  - `rejected-after-resume`
  - `rejected-after-interruption`

This keeps the behavior inspectable through the existing diagnostics path.

## 2. Single-spike rollback

### Why

A large share of visibly fake route geometry comes from one accepted bad fix that is immediately followed by a return to the real path.

Pattern:
- point `A` is valid
- point `B` is a GPS spike
- point `C` returns near the real route

If `B` is persisted, the route draws a sharp diagonal or triangular detour.

### Product decision

Support a conservative one-point rollback for recent geometry only.

This should not be a general smoothing pass.
It should be a narrow live-recording correction for obvious spikes.

### Recommended V1 rule

Given `A, B, C`:
- if `B` creates a large deviation from the direct line `A -> C`
- and `A -> B` plus `B -> C` are much worse than `A -> C`
- and `C` arrives soon enough to act as a reliable confirmation point
- and the result looks like a short-lived teleport rather than a real detour

then:
- remove `B`
- keep `A` and `C`

### Limits

V1 constraints:
- one-point rollback only
- no unlimited repeated reduction
- no general-purpose route simplifier
- start with:
  - `walk`
  - `bike`
  - `auto`

For `drive`:
- either skip V1
- or use much stricter rollback thresholds

For `boat` and `plane`:
- out of scope in V1

### Diagnostics

Add explicit reason(s), for example:
- `removed-as-spike`
- optional:
  - `accepted-then-rolled-back`

Diagnostics should indicate that a point was first accepted and later removed by spike control.

## 3. Pending continuity confirmation

### Why

Some candidate points are not bad enough to reject immediately, but they are still too risky to commit as ordinary continuity points.

Examples:
- medium-quality first point after resume
- awkward jump with plausible speed but suspicious geometry
- large direction change after sparse sampling

### Product decision

Introduce a very small pending-continuity mechanism for suspicious cases.

This is not a full buffered route engine.
It is a targeted hold-and-confirm step.

### Recommended V1 behavior

If a point is:
- not clearly invalid
- but too suspicious to accept directly

then:
- hold it as a pending continuity candidate
- require the next point to confirm that branch

If the next point confirms the branch:
- accept the pending point
- accept the confirming point

If the next point does not confirm it:
- discard the pending point

### Important constraint

Only use this mechanism for explicitly suspicious continuity cases.
Do not apply it to normal clean movement.

### Diagnostics

Add reason(s) such as:
- `pending-continuity`
- `confirmed-pending-continuity`
- `rejected-pending-continuity`

## Implementation direction

## Mobile implementation

### 1. Extend trip point filtering helpers

In `mobile/src/services/trip-points/trip-points.service.ts`:
- add small helpers to identify recovery context
- add helpers for recent three-point spike evaluation
- keep the file as the main insertion point for live point acceptance

Do not move this logic into UI or location transport layers.

### 2. Preserve current filtering order

The overall flow should remain understandable and deterministic.

Recommended order:
1. duplicate checks
2. accuracy check
3. context detection
4. suspicious continuity / pending handling
5. implied speed check
6. jump-distance / recovery-specific handling
7. recent spike rollback evaluation
8. final append / diagnostics

Exact ordering may vary slightly if needed, but it should remain explicit and testable.

### 3. Keep persisted model impact minimal

V1 should avoid major schema changes.

Preferred approach:
- keep recovery and pending state in lightweight recording-session or in-memory filtering state only if needed
- persist only accepted trip points
- persist diagnostics summaries through the existing diagnostics path

If additional diagnostics counters are required:
- extend the existing diagnostics summary rather than creating a new telemetry model

## Diagnostics and sync

Because `PLAN_42` already syncs compact diagnostics:
- add only the minimum new counters or recent-event reasons required
- do not sync raw continuity buffers
- do not sync raw spike candidate history

The important thing is to preserve answerability:
- why was this point accepted?
- why was it delayed?
- why was it rolled back?

## Validation strategy

Validate with real-world traces covering:

1. start and move immediately
- expected:
  - no large fake first segment

2. pause for several minutes, then continue
- expected:
  - route resumes without a fake reconnect

3. interrupted app/session continuation
- expected:
  - route continuation is believable

4. single GPS teleport followed by return
- expected:
  - spike is removed or never committed

5. urban walk with building reflections
- expected:
  - fewer sharp fake diagonals

6. slow bike or auto movement with sparse updates
- expected:
  - suspicious continuity points are less likely to distort the route

## Testing requirements

### Service-level

Add or extend tests around `trip-points.service.ts` for:
- early-session suspicious first point
- first valid point after resume
- first valid point after interruption
- accepted long-gap recovery
- one-point spike rollback
- pending continuity confirmed
- pending continuity rejected

### Diagnostics-level

Verify:
- new decision reasons are counted correctly
- synced diagnostics remain compact and stable

## Risks

### Risk: over-filtering real movement

Mitigation:
- keep V1 narrow
- only apply pending/rollback logic in suspicious cases
- preserve mode-aware thresholds

### Risk: too much complexity in the hot path

Mitigation:
- keep helpers small and explicit
- avoid large mutable state machines
- prefer one-point or one-candidate logic in V1

### Risk: hidden behavior that is hard to debug

Mitigation:
- require explicit diagnostics reasons
- avoid silent retroactive geometry changes

## Expected outcome

After this plan:
- route starts should be less fragile
- resume and interruption recovery should produce cleaner continuity
- obvious single-point teleports should stop distorting the map
- raw persisted trip geometry should become more believable before any post-recording smoothing

## Relevant existing code

- `mobile/src/services/trip-points/trip-points.service.ts`
- `mobile/src/services/trip-points/trip-point-diagnostics.service.ts`
- `mobile/src/services/recording/background-recording-task.ts`
- `mobile/src/screens/recording/recording-screen.tsx`
- `mobile/src/services/recording/recording.service.ts`
- `mobile/src/storage/recording-storage.ts`
- `mobile/src/services/trips/server-trip-sharing.service.ts`
- `server/src/trips/dto/sync-trip.dto.ts`
- `server/src/trips/trips.service.ts`
- `server/prisma/schema.prisma`
