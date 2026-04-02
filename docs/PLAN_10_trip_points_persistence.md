# PLAN 10: Trip Points Persistence

## Goal

Persist `TripPoint` samples locally while recording is active so that Trailbook can:

- reconstruct the actual route path
- calculate distance from recorded points
- support route polyline rendering later
- provide a reliable source for future sync

This plan is mobile-only.
It focuses on local persistence first.
It does not include backend sync yet.

## Why this matters

Right now the app knows:

- when a trip started
- when it stopped
- which waypoints were added

But it still does not know the actual route path between those events.

That leaves several important gaps:

- `km` cannot be calculated correctly
- the map cannot show the recorded route
- trip summaries stay partial
- sync later would miss the main trail data

At this point `TripPoint` persistence is the main missing foundation piece.

## Desired user experience

### 1. Recording creates a real route trail

When recording is active:

- location updates should create local `TripPoint` records
- those records should belong to the active trip
- if the app is restarted, the already recorded points must remain available

### 2. Distance becomes available

After a trip has at least a small number of valid recorded points:

- trip summaries can show real distance
- filtered summary blocks in `Trips` can use real totals

### 3. Route can be shown on a map

Once points are persisted, the app should be able to render:

- a polyline on the recording screen for the active trip
- a polyline later in trip details for finished trips

The first slice does not need full visual polish.
It needs correct data first.

## Scope

Included in this plan:

- local `TripPoint` creation during active recording
- local `TripPoint` storage and hydration
- deduplication / basic guards against noisy or duplicate samples
- distance calculation from saved points
- trip-level access helpers for points

Not included in this plan:

- backend sync of trip points
- background task recording while app is fully suspended
- advanced smoothing or map matching
- battery-adaptive smart sampling beyond existing profile config
- final route polyline UI polish

## Domain model

The existing `TripPoint` shape is already close to what we need:

- `tripLocalId`
- `deviceId`
- `userId`
- `latitude`
- `longitude`
- `recordedAt`
- `accuracy`
- `altitude`
- `speed`
- `syncStatus`

This plan should use that model directly.

Potential additions should be avoided unless clearly necessary.

## Technical approach

### 1. Persist points in a dedicated store

Create or activate a dedicated local `trip-points` storage path:

- load all saved trip points on hydration
- expose a state store similar to `trips`, `waypoints`, and attachments
- write through to local persistence on every append

### 2. Convert location snapshots into trip points

Whenever the active recording session receives a new foreground location sample:

- validate that there is an active trip
- transform the sample into a `TripPoint`
- append it to the local store

This should happen only while status is `recording`, not `idle`.

### 3. Guard against duplicate or low-value samples

The first implementation should include small safeguards:

- skip exact duplicate `recordedAt` values
- skip points for missing active trip
- optionally ignore clearly invalid coordinates

The goal is not perfect filtering.
The goal is to avoid obviously redundant or broken writes.

### 4. Calculate distance from ordered points

Distance should be derived from persisted points, not from waypoints.

At minimum:

- sort points by `recordedAt`
- compute segment distance between consecutive points
- sum those distances for a trip total

If needed, apply a small guard against tiny jitter segments.

### 5. Expose trip point selectors

The app needs reusable helpers for:

- all visible points for one trip
- ordered points for one trip
- trip distance summary

These helpers should live in a service layer, not inside screen JSX.

## Suggested implementation phases

### Phase 1: Store and hydration

Implement:

- `trip-points` storage
- `trip-points` state store
- app hydration integration

Completion signal:

- the app can load and persist `TripPoint[]` locally

### Phase 2: Recording append flow

Implement:

- conversion from location updates to `TripPoint`
- append on active recording only
- duplicate guards

Completion signal:

- a started trip accumulates local points over time

### Phase 3: Distance calculation

Implement:

- helper functions for ordered trip points
- total distance calculation
- integration into `Trips` summary and per-trip card values

Completion signal:

- `km` in `Trips` is no longer `n/a`

### Phase 4: Route path rendering

Implement:

- active-trip polyline on the recording screen
- optional trip-details polyline later if the screen structure allows it

Completion signal:

- the route shape is visible on the map from persisted points

## Risks

### 1. Too many writes

Frequent location updates can create many local writes.

Mitigation:

- use the existing profile-based sampling intervals
- add duplicate guards
- keep the first slice simple before optimizing batching

### 2. Jitter inflates distance

GPS drift can produce fake distance, especially when standing still.

Mitigation:

- add minimal segment-distance guards later if needed
- prefer correctness improvements after real-device testing

### 3. Partial route after app interruption

Foreground-only recording may miss route segments when the app is fully killed or backgrounded.

Mitigation:

- accept this limitation for now
- still persist everything captured while active
- defer true background recording to a later plan

## Completion criteria

This plan is complete when:

- `TripPoint` records are persisted locally during active recording
- points survive restart and hydration
- trip distance is computed from saved points
- `Trips` summary can use real route distance
- the app has a clean data foundation for later route polyline rendering and sync
