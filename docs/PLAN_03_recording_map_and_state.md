# PLAN 03: Recording Map And State

## Goal

Turn the current placeholder recording screen into a real recording-focused mobile screen that:

- shows the user's current location on a map
- clearly communicates recording state
- supports start, active, and interrupted recording states
- preserves local-first behavior

This plan is still mobile-only.
It does not include backend sync work.

## Desired user experience

The recording screen should be centered around the map, not around debug fields.

Primary behavior:

1. the user opens the recording screen
2. the app requests or confirms location access
3. the map centers on the user's current location
4. a large recording control is shown over the map
5. the control reflects one of three states:
   - idle
   - actively recording
   - interrupted recording

## Recording control states

### 1. Idle state

Meaning:

- no active trip is in progress
- no unfinished local recording session needs recovery

UI behavior:

- show a large start icon/button over the map
- tapping it starts a new recording session

Expected action:

- create a local trip if one does not already exist
- move the recording state to active

### 2. Active recording state

Meaning:

- a trip is currently active
- the app believes recording should continue

UI behavior:

- show a visually distinct active recording control
- user can clearly see that recording is in progress

Expected action when tapped:

- stop the current recording
- close the active trip locally

### 3. Interrupted recording state

Meaning:

- a trip exists locally and appears unfinished
- the previous active recording flow was interrupted
- interruption may be caused by app termination, crash, or unexpected shutdown

UI behavior:

- show a third state that is visually different from both idle and active
- tapping it should open a confirmation dialog

Dialog options:

- continue recording
- stop current recording
- cancel

Expected action:

- `continue` restores active recording state
- `stop` closes the active trip locally

## Why interrupted state matters

The app should not silently decide whether an unfinished trip is active or stopped.

This is especially important because:

- recording is started manually
- recording should be user-controlled
- app termination does not necessarily mean the user intended to stop

So the app must preserve enough local metadata to distinguish:

- cleanly stopped recording
- still-active recording
- recording that needs user recovery input

## Scope

Included in this plan:

- map on recording screen
- current location marker
- location permission flow for the foreground use case
- three-state recording control
- interrupted session recovery UI
- local state required to model interrupted recording

Not included in this plan:

- background location tracking
- continuous route sampling in the background
- trip polyline rendering
- waypoint creation
- sync
- advanced geo filtering

## Technical approach

### 1. Map foundation

Add a map component to the recording screen.

Recommended first version:

- use a React Native map library that works well with Expo
- show only the current user marker initially
- center the camera/region around the user location

First implementation should avoid:

- custom map overlays
- route polylines
- clustering
- excessive map controls

### 2. Foreground location

Add foreground location support only.

First version should:

- request foreground permission
- fetch current position
- subscribe to foreground position updates while the screen is active
- update current map marker from those updates

Important:

- do not treat foreground location support as equivalent to reliable background recording
- keep assumptions conservative, especially on iOS

### 3. Recording state model

Extend recording state to explicitly model lifecycle, not just boolean flags.

Suggested direction:

- `idle`
- `recording`
- `interrupted`

The current `RecordingSessionSummary` is too small for the intended UX.

It likely needs fields such as:

- `status`
- `activeTripId`
- `startedAt`
- `lastPointRecordedAt`
- `interruptedAt`
- `userId`
- `userEmail`
- `deviceId`

### 4. Interrupted session detection

The app should detect interruption during store hydration.

Suggested logic:

- if there is an unfinished local trip
- and the persisted recording session says it was active
- and the app is starting fresh
- mark the session as `interrupted` until the user decides what to do

Do not auto-resume without asking the user.

### 5. Confirmation UI

When the interrupted control is tapped, show a lightweight confirmation modal or alert.

Options:

- continue recording
- stop recording
- cancel

The chosen path should update both:

- recording session store
- local trip data

## Suggested implementation phases

### Phase 1: Recording state upgrade

Upgrade the recording store and domain types to support:

- `idle`
- `recording`
- `interrupted`

Exit criteria:

- the store can represent all three states explicitly
- current screen no longer infers state from only `isRecording`

### Phase 2: Interruption detection

Add hydration logic that converts unfinished sessions into `interrupted`.

Exit criteria:

- killing/restarting the app during an active trip can surface the interrupted state
- the app does not silently discard unfinished recording

### Phase 3: Map integration

Introduce map rendering and current location marker.

Exit criteria:

- recording screen shows a map
- current user location is visible
- map centers around the user

### Phase 4: Recording control redesign

Replace the current button stack with a single prominent recording control over the map.

Exit criteria:

- the control has clearly different visual states for idle, recording, and interrupted
- interaction matches the intended behavior

### Phase 5: Recovery flow

Add confirmation flow for interrupted recording.

Exit criteria:

- interrupted state asks the user whether to continue or stop
- both actions update local state correctly

## Files likely to change

Expected touched areas:

- `mobile/src/domain/trips.ts`
- `mobile/src/state/recording-store.ts`
- `mobile/src/services/recording/recording.service.ts`
- `mobile/src/screens/recording/recording-screen.tsx`
- `mobile/src/components/...` for map overlay controls
- `mobile/package.json` for map/location dependencies

Possible new files:

- `mobile/src/services/location/location.service.ts`
- `mobile/src/components/recording/recording-control.tsx`
- `mobile/src/components/recording/interrupted-recording-dialog.tsx`

## Risks

- map packages can introduce native setup overhead
- iOS permission flow can distract from recording state work if not kept minimal
- interruption logic can become brittle if trip lifecycle is not modeled explicitly
- mixing map state and recording state directly inside the screen can recreate the same structural problem we already removed

## Validation

Minimum validation for this plan:

- mobile typecheck
- app runs on device/simulator
- location permission prompt works
- map renders
- current location marker updates
- recording state transitions:
  - idle -> recording
  - recording -> stopped
  - recording -> app restart -> interrupted
  - interrupted -> continue
  - interrupted -> stop

## Recommendation

Execution order should be:

1. upgrade recording state model
2. add interrupted recovery logic
3. add location permission and current location
4. add map rendering
5. replace button stack with a single recording control

This keeps domain/state correctness ahead of UI polish and avoids building the wrong interaction model on top of an underspecified state machine.
