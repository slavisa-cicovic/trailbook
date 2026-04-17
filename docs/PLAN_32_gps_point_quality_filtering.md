# PLAN 32: GPS Point Quality Filtering

## Goal

Reduce obviously wrong route geometry by filtering low-quality GPS points before they become persisted trip points and before they are drawn on the map.

This plan targets the real problem seen in route screenshots:
- sharp impossible jumps
- long diagonal shortcuts
- noisy loops caused by bad fixes

The focus is not "perfect navigation accuracy". The focus is:
- fewer bad points
- more believable route lines
- better walking routes on real consumer phones

## Problem Diagnosis

The current route pipeline accepts too many bad points.

### Current Behavior

Relevant code:
- `mobile/src/services/location/location.service.ts`
- `mobile/src/services/trip-points/trip-points.service.ts`

Current issues:

1. `walk` and `auto` can run with relatively sparse intervals
- `walk` currently uses `timeInterval: 60s`
- `auto` currently uses `Balanced` accuracy and `timeInterval: 60s`

2. point acceptance is too permissive
- `appendTripPointIfUseful(...)` only rejects:
  - duplicate timestamps
  - identical coordinates

3. no quality gate exists for:
- bad `accuracy`
- impossible jump distance
- impossible inferred speed
- severe jitter around a mostly stationary or slow-moving path

That means one bad fix is enough to visibly distort the route.

## Product Principle

It is better to miss an occasional point than to draw an obviously wrong path.

For Trailbook, users will tolerate:
- slightly simplified geometry
- somewhat shorter recorded distance

They will not tolerate:
- route spikes
- fake diagonal lines
- impossible detours created by bad GPS fixes

## Correct Insertion Point

The filter should run before the point is appended to trip storage.

That means:
- keep `toSnapshot(...)` simple
- keep storage schema unchanged
- add filtering logic inside `trip-points.service.ts`

This is the correct place because:
- both foreground and background recording already pass through `appendTripPointIfUseful(...)`
- one filter there affects the whole app consistently

## Proposed Filtering Rules

### Rule 1: Reject Very Poor Accuracy

If a point has very poor reported accuracy, reject it.

Initial pragmatic thresholds:
- `walk`: reject if `accuracy > 35m`
- `bike`: reject if `accuracy > 50m`
- `drive`: reject if `accuracy > 80m`
- `boat`: reject if `accuracy > 120m`
- `plane`: accuracy filter can be relaxed

If `accuracy` is `null`, do not reject purely on that basis. Use jump/speed rules too.

Reason:
- walking routes are most sensitive to bad fixes
- a 60m wrong point completely ruins a pedestrian route line

### Rule 2: Reject Impossible Speed Jumps

Compute implied speed from:
- previous accepted point
- current candidate point
- elapsed time

If implied speed is wildly implausible for the current recording mode, reject the point.

Initial hard caps:
- `walk`: reject if implied speed > `12 km/h`
- `bike`: reject if implied speed > `55 km/h`
- `drive`: reject if implied speed > `180 km/h`
- `boat`: reject if implied speed > `90 km/h`
- `plane`: allow much higher values

For `auto`, use a conservative ground cap until mode becomes clear.

Reason:
- most visible map corruption comes from a bad point far away from the last real point

### Rule 3: Reject Single Huge Distance Leaps

Independent of speed, reject sudden giant leaps if they are inconsistent with the current context.

Examples:
- walking point suddenly 300m away after one minute
- bike point suddenly 1km away with mediocre accuracy

Initial guardrails:
- `walk`: reject if single jump > `120m`
- `bike`: reject if single jump > `400m`
- `drive`: reject if single jump > `2500m`

These are not final values. They are starting safety rails.

### Rule 4: Add Minimum Movement Jitter Suppression

If the candidate point is very close to the previous accepted point, skip it.

Current code only suppresses exact same coordinates.
That is too weak.

Add mode-aware minimum movement:
- `walk`: skip if movement < `8m`
- `bike`: skip if movement < `15m`
- `drive`: skip if movement < `30m`

Reason:
- consumer GPS often oscillates by a few meters even when the user is nearly still

## Sampling Adjustments

Filtering alone is not enough. The sampling profile also needs small correction.

### Walk

Current `walk` settings are too sparse for good geometry:
- `timeInterval: 60s`

Recommended V1 adjustment:
- lower `walk` `timeInterval` to `15-20s`
- keep `accuracy: High`

This gives the filter more frequent candidate points and reduces large straight-line joins.

### Auto

Current `auto` starts with:
- `accuracy: Balanced`
- `timeInterval: 60s`

Recommended V1 adjustment:
- keep `Balanced` if battery is a concern
- but lower `timeInterval` to `20-30s`

Reason:
- sparse points plus bad fixes amplify route ugliness

## Mode Awareness

Filtering should be aware of the current recording mode/profile.

Important distinction:
- manual `walk/bike/drive/...`
- `auto`

For `auto`, use:
- current concrete recording profile if already inferred
- otherwise a conservative ground-travel fallback

This avoids:
- early bad points being accepted just because no mode is established yet

## Rendering Policy

Do not solve this only at render time.

The main fix must happen at persistence time:
- bad points should not enter `trip_points` in the first place

Optional later enhancement:
- lightweight visual smoothing for map polyline rendering

But that is secondary.

If the raw point set is bad, smoothing only hides part of the problem.

## Migration / Backward Compatibility

This plan should not rewrite existing historical trips.

Scope is:
- newly recorded points only

Old trips with bad geometry remain as-is unless we later add:
- `route cleanup`
- or `rebuild trip polyline` tools

That future work is separate.

## Testing Requirements

### Service-Level

Add tests for `appendTripPointIfUseful(...)` or new helper functions:
- reject poor-accuracy walking point
- reject impossible jump speed
- reject giant walk leap
- suppress tiny jitter
- accept plausible sequential points

### Manual Device Tests

Validate on real device:
- walking route in city block
- standing still for a few minutes
- short walk with turns
- weak GPS environment near buildings

Expected result:
- fewer spikes
- fewer diagonal shortcuts
- cleaner route shape

## Out of Scope

- map-matching to roads/paths
- Kalman filter / advanced smoothing
- post-processing cleanup of old trips
- server-side geometry correction

## Outcome

After this plan:
- bad GPS fixes are filtered before persistence
- walking and auto routes look materially cleaner
- route screenshots become more believable
- the app remains simple and battery-conscious, without pretending to be a turn-by-turn navigation engine
