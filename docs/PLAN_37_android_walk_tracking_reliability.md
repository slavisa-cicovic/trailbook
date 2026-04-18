# PLAN 37: Android Walk Tracking Reliability

## Goal

Fix unreliable `walk` trip recording on Android devices.

The concrete failure we want to address is:

- iOS records a plausible walking route
- Android records far too few points for the same walk
- total distance and route shape become obviously wrong

This is not an auto-mode plan. It is a focused `walk on Android` reliability plan.

## Problem statement

From recent real-device tests:

- iOS `walk`
  - recorded a dense enough path
  - total distance was plausible
- Android `walk`
  - recorded dramatically fewer points
  - total distance was far too low

This means the failure is likely happening in one or both places:

1. Android location updates are too sparse
2. our `walk` point acceptance filter rejects too many Android samples

The first job is to determine which of those is dominant.

## Scope

In scope:

- Android `walk` recording profile
- Android `walk` point filtering
- temporary observability for rejected point reasons
- repeatable A/B testing against iOS

Out of scope:

- auto mode
- bike/drive tuning
- route smoothing
- server sync/share
- web

## Relevant existing code

- `mobile/src/services/location/location.service.ts`
- `mobile/src/services/trip-points/trip-points.service.ts`
- `mobile/src/services/recording/background-recording-task.ts`
- `mobile/src/screens/recording/recording-screen.tsx`

## Hypotheses

Most likely causes:

### Hypothesis 1: Android is undersampled before filtering

The OS delivers too few usable updates because of:

- foreground/background throttling
- battery optimization
- vendor-specific location batching
- current `walk` request profile being too weak for Android

### Hypothesis 2: Our `walk` filter is too aggressive

Even when Android produces updates, we may be dropping too many because of:

- `maxAccuracyMeters`
- `minMovementMeters`
- `maxJumpDistanceMeters`
- implied speed guards

### Hypothesis 3: Both are true

This is the most realistic scenario:

- Android gives fewer updates than iOS
- then our filter removes too many of the remaining updates

## Plan

### Slice 1: Add temporary walk-point diagnostics

Add lightweight instrumentation around `appendTripPointIfUseful(...)` for `walk`.

We need counts for:

- accepted points
- rejected by duplicate timestamp
- rejected by duplicate coordinates
- rejected by accuracy
- rejected by min movement
- rejected by jump distance
- rejected by implied speed

This should be temporary and local-only.

Recommended implementation:

- keep a tiny in-memory debug summary
- reset it when a trip starts
- update it while recording
- expose it only via temporary debug logging or a small internal helper

Why:

- without this we are still guessing whether the failure is input sparsity or over-filtering

### Slice 2: Audit current Android walk sampling

Review `walk` settings in `location.service.ts`:

- `accuracy`
- `distanceInterval`
- `timeInterval`

Compare current requested cadence against observed Android behavior from real tests.

Expected output of this slice:

- explicit statement whether current settings are too conservative for Android walking

### Slice 3: Tighten Android walk sampling

If the diagnostic confirms sparse raw updates, strengthen the Android `walk` request profile.

Possible changes:

- smaller `distanceInterval`
- smaller `timeInterval`
- keep `High` accuracy

Important:

- prefer platform-specific tuning if needed
- do not worsen iOS just to accommodate Android

If Expo location config does not allow clean platform-specific tuning in the same shape, prefer the smallest shared change that clearly improves Android.

### Slice 4: Relax walk filtering where justified

If diagnostic confirms many valid Android points are being dropped, tune `walk` thresholds in `trip-points.service.ts`.

Most likely candidates:

- reduce `minMovementMeters`
- slightly relax `maxAccuracyMeters`

Be conservative:

- do not reintroduce obvious jitter just to gain density
- any relaxation must still preserve route quality

### Slice 5: Re-test on same route

Repeat a simple same-route comparison:

- Android `walk`
- iOS `walk`
- same start/stop conditions

Compare:

- point count
- total distance
- route shape

Success criteria:

- Android no longer collapses to a tiny fraction of the actual route
- Android point count is materially closer to iOS
- route looks plausibly continuous

### Slice 6: Remove temporary diagnostics

Once we know the cause and the fix is validated:

- remove temporary debug counters/logging
- keep only the actual profile/filter adjustments

## Implementation guidance

### Preferred order

1. add diagnostics
2. run one Android walk test
3. decide whether to change sampling, filtering, or both
4. re-test
5. remove diagnostics

This order matters.

If we tune blindly first, we may improve one device by accident while masking the real cause.

## Risks

### Risk 1: More points, but more noise

If we only increase sampling:

- route density improves
- but jitter may increase

Mitigation:

- pair sampling increases with disciplined filter review

### Risk 2: Relaxed filters reintroduce bad traces

If we loosen `walk` thresholds too much:

- stationary jitter
- tiny zig-zag noise
- fake distance inflation

Mitigation:

- only relax one threshold at a time
- retest after each step

### Risk 3: OEM-specific Android behavior

One Android phone may behave very differently from another.

Mitigation:

- optimize first for the currently failing test device
- avoid pretending a single fix solves all Android hardware classes

## Deliverables

### V1

- temporary diagnostics for `walk`
- tuned Android `walk` sampling and/or filtering
- verified same-route retest improvement

### V1.1

- optional platform-specific profile split if shared tuning is not enough

## Recommendation

Do not broaden this into another general GPS plan.

Treat it as:

- a platform-specific `walk` reliability bug
- with observability first
- and targeted tuning second
