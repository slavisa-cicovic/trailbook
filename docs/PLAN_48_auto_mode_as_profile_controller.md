# PLAN 48: Auto Mode as a Recording Profile Controller

## Goal

Fix AUTO recording mode so it behaves as a controller that changes the active concrete recording profile, instead of behaving as a separate tracking/filtering profile.

AUTO should decide when the trip should switch between:

- `walk`
- `bike`
- `drive`
- `boat`
- `plane`

But location sampling, point filtering, diagnostics context, and segment creation should use the currently active concrete profile.

## Problem

Current AUTO behavior mixes two different concepts:

- user intent: the user selected `auto`
- active recording profile: the trip is currently being recorded as `walk`, `bike`, `drive`, etc.

Because of this, parts of the app use `recordingMode === "auto"` directly for:

- foreground location tracking options
- background location tracking options
- point filtering thresholds
- diagnostics labeling
- background task recording decisions

That makes AUTO a separate recording profile with its own sampling/filtering behavior.

This is the wrong model.

Observed consequence:

- fixed `walk`, `drive`, and `boat` modes produce good routes
- AUTO can produce too few location points
- AUTO can misclassify drive-like trips as bike-like trips
- once AUTO starts with weak sampling, inference quality becomes worse because it has fewer points to reason from

## Product Decision

AUTO is not a physical recording profile.

AUTO is a strategy that is allowed to change the current concrete profile while recording.

The trip should start with:

- `recordingMode = auto`
- `recordingProfile = walk`

Then an inference observer suggests profile changes.

The recording controller applies those changes in the same way manual mode switching currently does:

- close the active segment
- open a new segment with the new concrete profile
- update the recording session
- restart location tracking with the new concrete profile

Manual mode switching during recording stays temporarily because it is useful for testing.
Long term, manual switching during active recording can be removed or hidden once AUTO is reliable enough.

## Key Principle

Use `recordingMode` only to answer:

> Is automatic profile switching enabled?

Use `recordingProfile` to answer:

> Which concrete tracking/filtering behavior should be active right now?

## Desired Runtime Model

### Fixed Mode

If the user starts a trip as `drive`:

- `recordingMode = drive`
- `recordingProfile = drive`
- tracking uses `drive`
- filtering uses `drive`
- segment profile is `drive`

### Auto Mode

If the user starts a trip as `auto`:

- `recordingMode = auto`
- `recordingProfile = walk`
- first segment profile is `walk`
- tracking uses `walk`
- filtering uses `walk`

If the observer later detects driving:

- `recordingMode` remains `auto`
- `recordingProfile` changes to `drive`
- current segment is closed
- a new `drive` segment is opened
- tracking restarts with `drive`
- filtering uses `drive`

If the observer later detects walking again:

- `recordingMode` remains `auto`
- `recordingProfile` changes to `walk`
- current segment is closed
- a new `walk` segment is opened
- tracking restarts with `walk`
- filtering uses `walk`

## Architecture Direction

Introduce a clearer split:

- Auto observer: reads location history and motion activity, then emits a proposed concrete profile
- Recording controller: decides whether to apply that proposal
- Segment manager: closes/opens segments
- Location tracking service: receives only concrete profiles
- Point filtering service: receives only concrete profiles

AUTO should not be passed into low-level sampling/filtering code except where diagnostics explicitly need to know the user selected AUTO.

## Required Code Changes

### 1. Start AUTO trips as walk

When starting a trip with `recordingMode = auto`:

- keep `recordingMode = auto`
- set `recordingProfile = walk`
- create the initial segment as `walk`
- start foreground/background tracking with `walk`

Do not start tracking with `auto`.

### 2. Use active concrete profile for tracking

Replace calls that pass `recordingSession.recordingMode` into location tracking with the concrete active profile.

Examples to audit:

- `watchForegroundLocation(...)`
- `startBackgroundLocationTracking(...)`
- `restartBackgroundLocationTracking(...)`
- `syncBackgroundLocationTracking(...)`

For active recording, the input should usually be:

- `recordingSession.recordingProfile`

not:

- `recordingSession.recordingMode`

### 3. Use active concrete profile for point filtering

Replace AUTO filtering behavior with concrete-profile filtering.

Examples to audit:

- `appendTripPointIfUseful(...)`
- route smoothing thresholds
- max accuracy thresholds
- jump distance thresholds
- implied speed thresholds
- min movement thresholds

Point filtering should use `recordingSession.recordingProfile`.

Diagnostics can still include `recordingMode = auto` separately.

### 4. Keep AUTO inference gated by recording mode

Only run the AUTO observer if:

- `recordingSession.recordingMode === "auto"`

But the observer should propose a concrete `RecordingProfile`, never `auto`.

### 5. Apply AUTO transitions like manual profile changes

When AUTO inference becomes stable enough:

- close active segment
- open next segment with inferred profile
- update `recordingSession.recordingProfile`
- keep `recordingSession.recordingMode = auto`
- restart location tracking with the inferred profile

This should be the same operational path as manual profile switching, with the only difference that the trigger is automatic.

### 6. Preserve manual switching for testing

For now, keep manual mode/profile switching during recording.

Manual switching is useful for:

- comparing fixed mode vs AUTO mode
- quickly correcting a bad AUTO segment during field tests
- testing profile-specific tracking configs

Future cleanup can remove or hide manual switching while active recording is in progress.

## Diagnostics Requirements

Diagnostics should record enough context to debug AUTO reliably.

For each relevant diagnostic event, capture:

- `recordingMode`
- active `recordingProfile`
- inferred candidate profile
- candidate start time
- motion activity type
- motion activity confidence
- motion activity age
- callback source
- accepted/rejected reason

This is important because `recordingMode = auto` alone is no longer enough to explain route quality.

## Expected Behavior After Refactor

AUTO route quality should become close to fixed-mode route quality for the currently active profile.

If AUTO misclassifies `drive` as `bike`, the sampling should still be based on the active concrete profile, not an abstract AUTO profile.

That means route quality and mode classification become two separate problems:

- route quality: should be mostly fixed by using concrete profiles for tracking/filtering
- mode classification: can be improved later with better heuristics, motion activity weighting, or profiles like `city_drive`

## Drive vs Bike Follow-up

City driving can overlap with bike speeds because of:

- traffic lights
- stop-and-go traffic
- low-speed urban roads
- parking / slow exits

Do not solve this in the first AUTO refactor.

Possible future improvement:

- introduce `city_drive`
- or treat `drive` as a motion-assisted profile when OS activity says automotive
- or defer final label until the segment has enough context

## Non-goals

- Do not implement snap-to-road in this plan.
- Do not add `city_drive` in this plan.
- Do not remove manual active-recording profile switching yet.
- Do not redesign the entire trip segment model.
- Do not tune every inference threshold before fixing the architecture.

## Implementation Phases

### Phase 1: Audit and Rename Call Sites

Audit all places that pass `recordingMode` into tracking/filtering code.

Classify each use:

- user intent check: keep `recordingMode`
- concrete behavior: switch to `recordingProfile`
- diagnostics: pass both

### Phase 2: Tracking Uses Concrete Profile

Change location tracking setup to use `recordingProfile`.

Verify:

- AUTO starts as walk tracking
- AUTO drive segment restarts as drive tracking
- AUTO bike segment restarts as bike tracking

### Phase 3: Filtering Uses Concrete Profile

Change point filtering to use `recordingProfile`.

Verify:

- accepted/rejected counts are comparable to fixed mode
- AUTO no longer has reduced point count just because the user selected AUTO

### Phase 4: AUTO Transition Controller Cleanup

Refactor AUTO transition application so it clearly emits and applies concrete profile changes.

Ensure:

- `recordingMode` remains `auto`
- `recordingProfile` changes
- segments are created with concrete profiles
- tracking restarts with concrete profile

### Phase 5: Diagnostics Upgrade

Extend diagnostics to include active concrete profile next to recording mode.

This is required before deeper AUTO heuristic tuning.

## Test Plan

### Fixed Mode Regression

Record and compare:

- Walk fixed mode
- Drive fixed mode
- Boat fixed mode

Expected:

- no route quality regression
- point counts remain comparable to current fixed-mode behavior

### AUTO Walk Start

Start AUTO and walk for several minutes.

Expected:

- first segment is `walk`
- tracking config is walk
- no unnecessary segment switch

### AUTO Drive Transition

Start AUTO, walk briefly, then drive.

Expected:

- trip starts as `walk`
- AUTO proposes `drive`
- segment changes to `drive`
- background tracking restarts with drive config
- point count resembles fixed drive mode, not old AUTO behavior

### AUTO Bike/Drive Ambiguity

Run city traffic tests where bike and drive speeds overlap.

Expected:

- route point density remains acceptable
- classification may still need later tuning
- diagnostics clearly show why the chosen profile was selected

## Success Criteria

AUTO mode is considered fixed at the architecture level when:

- AUTO no longer uses separate sampling/filtering thresholds
- active tracking profile is always concrete
- active filtering profile is always concrete
- AUTO can switch segments without losing point density
- diagnostics can explain both route quality and profile decisions

