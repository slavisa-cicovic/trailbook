PLAN 33: Post-Recording Route Smoothing

Goal
- Allow the user to improve the shape of a finished trip route on mobile without introducing a full manual route editor.
- Keep this as a local post-processing action on ended trips.

Scope
- Mobile only.
- Finished (`ended`) trips only.
- A single explicit action on the existing `Route` screen, not a new editor screen.

Product Direction
- Do not let the user drag individual points on the phone.
- Instead, provide an `Improve route` / `Smooth route` action that runs a deterministic cleanup pass over recorded trip points.
- Treat this as a convenience correction tool for noisy GPS traces, not a geometry authoring tool.

Expected UX
- On an ended trip, the user can tap a compact action in the route toolbar.
- App runs a smoothing / cleanup pass on the trip points.
- Updated route is shown immediately.
- Trip becomes `pending-sync` if it was previously synced.
- Preferably allow one-step `Undo` in the same screen after the operation.

What Smoothing Should Do
- Remove obvious zig-zag jitter.
- Remove very small back-and-forth oscillations that inflate distance.
- Keep the general shape of the route intact.
- Avoid over-smoothing sharp real turns.
- Avoid changing timestamps or segment semantics unless strictly necessary.

What Smoothing Should Not Do
- No manual point dragging.
- No snapping to roads.
- No map-matching service.
- No web dependency.
- No change to segment modes.
- No route reconstruction from scratch.

Suggested Technical Approach
- Work only on the trip’s local `tripPoints`.
- Add a post-processing helper in `mobile/src/services/trip-points/trip-points.service.ts`.
- Start with a conservative algorithm:
  - drop tiny oscillation points where:
    - point B is close to line A->C
    - A->B and B->C are small
    - keeping B mostly adds jitter, not shape
  - optionally use a small angle + distance heuristic
  - preserve endpoints
- Recalculate route display from the cleaned `tripPoints`.

Suggested First Algorithm
- Three-point pass over ordered trip points:
  - for each `A, B, C`
  - compute:
    - `distance(A,B)`
    - `distance(B,C)`
    - `distance(A,C)`
    - perpendicular deviation of `B` from line `A->C`
  - if:
    - `A->B` and `B->C` are small enough
    - deviation is small enough
    - removing `B` does not create an excessive jump
  - then drop `B`
- Do one or two conservative passes, not unlimited repeated reduction.

Mode-Aware Behavior
- Start with `bike` and `walk` only, where jitter is most visible.
- For `drive`, use a lighter threshold or skip V1.
- `boat` and `plane` can be left unchanged in V1.

Data Model Impact
- No new server schema.
- No new mobile schema required for V1 if `Undo` is kept in-memory only.
- If persistent undo is desired later, add a lightweight temporary snapshot model.

Sync Behavior
- After smoothing:
  - update local `tripPoints`
  - update trip `updatedAt`
  - set trip `syncStatus` to:
    - `pending-sync` if it was synced before
    - keep `local-only` otherwise
- Server sync remains canonical replacement of current point set.

Waypoints and Attachments
- Leave waypoints and attachments unchanged.
- They remain anchored to existing waypoint coordinates, not to smoothed polyline geometry.

Undo Strategy
- V1:
  - keep one pre-smoothing snapshot in screen state
  - show temporary `Undo` action after smoothing
- If app reloads, undo can be lost in V1.

Relevant Existing Code
- `mobile/src/screens/trips/trip-route-screen.tsx`
- `mobile/src/services/trip-points/trip-points.service.ts`
- `mobile/src/state/trip-points-store.ts`
- `mobile/src/state/trips-store.ts`

Implementation Steps
1. Add a route smoothing helper to `trip-points.service.ts`.
2. Restrict V1 smoothing to ended trips.
3. Add `Smooth route` action on `trip-route-screen.tsx`.
4. Update local `tripPoints` and trip sync state after smoothing.
5. Add one-step in-memory undo on the route screen.
6. Validate on noisy real bike and walk trips.

Validation
- Test against known noisy bike trips.
- Confirm:
  - route looks cleaner
  - distance inflation is reduced
  - route does not lose real turns
  - sync still works after smoothing

Out of Scope
- Full trip editor
- Web route correction UI
- Road snapping / external routing APIs
- Automatic smoothing during live recording
