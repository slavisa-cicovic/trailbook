# PLAN 04: Recording Profiles

## Goal

Add user-selectable recording profiles to the mobile recording flow so that:

- the user can choose a sensible sampling mode before starting a route
- `Auto` is the default and recommended option
- the active mode can be changed while recording is already in progress
- the current trip stores which profile was used

This plan stays mobile-only.
It does not include backend sync work.

## Why this matters

Location battery cost mostly comes from obtaining location updates, not from calculating distance between already-known points.

That means the app should control:

- requested location accuracy
- time interval
- distance interval
- when the watcher is restarted with a different policy

The user should not need to understand raw technical parameters like:

- `timeInterval`
- `distanceInterval`
- GPS accuracy levels

Instead, the app should expose simple intent-based profiles.

## Profiles

The first supported profiles should be:

- `auto`
- `walk_relaxed`
- `city_walk`
- `drive_city`
- `drive_highway`
- `frequent`

### 1. Auto

Default mode.

Meaning:

- recommended for most trips
- app chooses a balanced configuration
- should favor lower battery use unless movement pattern suggests more frequent sampling is useful

First implementation note:

- the initial `auto` version can be a fixed balanced profile
- later it can become adaptive based on speed and recent movement

### 2. Walk / relaxed

Meaning:

- for slow movement and coarse route history
- favors battery life over route detail

Suggested shape:

- lower accuracy than `frequent`
- larger distance interval
- longer time interval

### 3. City walk

Meaning:

- for urban walking where route turns and shorter street segments matter
- balanced between detail and battery use

Suggested shape:

- moderate accuracy
- shorter distance interval than `walk_relaxed`
- moderate time interval

### 4. Drive / city

Meaning:

- for urban driving
- route detail matters because of turns, side streets, traffic lights, and slower speed

Suggested shape:

- higher accuracy than walking modes
- shorter interval than `drive_highway`
- still less aggressive than `frequent`

### 5. Drive / highway

Meaning:

- for higher-speed driving with longer, simpler road segments
- should avoid wasting battery on overly dense samples while still preserving exits and major turns

Suggested shape:

- balanced accuracy
- larger distance interval than `drive_city`
- moderate time interval

### 6. Frequent

Meaning:

- highest detail of all profiles
- user explicitly accepts higher battery use

Suggested shape:

- higher requested accuracy
- shorter distance interval
- shorter time interval

## Desired user experience

### Start flow

When the user starts a route:

1. tap the idle recording control
2. start dialog opens
3. user enters:
   - route name
   - optional description
   - recording profile
4. app starts the trip with that profile

Default selection:

- `Auto`

### Change mode during recording

While recording is active:

1. user taps a `Mode` action on the recording screen
2. a picker dialog or bottom sheet opens
3. user selects a different profile
4. app updates the active recording mode without stopping the trip
5. location watcher is reconfigured with the new profile

This must not create a new trip.
This must not require stop/start.

## Scope

Included in this plan:

- recording profile domain model
- profile selection in the start dialog
- current profile display on the recording screen
- live profile change while recording is active
- location watcher reconfiguration based on selected profile
- persisting selected profile on the trip and active session

Not included in this plan:

- background tracking
- server sync
- analytics-driven automatic tuning
- complex adaptive heuristics for `auto`
- profile history timeline within a trip

## Domain changes

### Trip

Add:

- `recordingProfile`

This is needed because the trip is the durable record of how the route was captured.

### RecordingSessionSummary

Add:

- `recordingProfile`

This is needed because the active session must know which watcher policy is currently in force.

## Technical approach

### 1. Introduce recording profile type

Add a dedicated type in the trips domain:

- `RecordingProfile = "auto" | "walk_relaxed" | "city_walk" | "drive_city" | "drive_highway" | "frequent"`

Use this consistently across:

- trip model
- recording session model
- recording services
- recording screen UI

### 2. Define location config mapping

Create a small mapping layer that converts a profile into location watcher options.

For example:

- requested accuracy
- `distanceInterval`
- `timeInterval`

This should live near the location service, not inside the screen.

Important:

- the first `auto` implementation can map to one balanced config
- adaptive behavior can come later without changing the UI contract

### 3. Start dialog changes

Extend the current start dialog to include profile selection.

Requirements:

- default to `Auto`
- keep route title required
- keep description optional
- keep the form simple and fast to use

### 4. Recording screen changes

Show the current profile on the recording screen and add a mode-change action.

Recommended first version:

- a compact `Mode` button near the recording metadata
- tap opens a simple modal or alert-like choice list

### 5. Reconfigure active watcher

The location watcher should be owned in a way that allows replacement when the profile changes.

Expected behavior:

- stop old watcher
- start new watcher with new config
- keep the same trip and active recording session
- continue collecting points under the updated policy

This reconfiguration should happen only when the effective profile changes.

## Suggested implementation phases

### Phase 1: Domain and persistence

Add `recordingProfile` to:

- `Trip`
- `RecordingSessionSummary`
- local storage serialization
- trip creation and recording session creation helpers

### Phase 2: Start dialog profile selector

Extend the start-recording modal to capture:

- route title
- description
- recording profile

### Phase 3: Location profile mapping

Add a profile-to-location-options mapping in the location service and use it when creating the watcher.

### Phase 4: In-session mode switching

Add `Mode` action on the recording screen and allow changing the profile while recording is active.

### Phase 5: UX polish

Improve copy and visibility:

- show active profile clearly
- label `Frequent` as higher battery use
- keep `Auto` visually recommended

## Risks

### 1. User confusion

If labels are too technical, the feature will feel noisy.

Mitigation:

- expose simple names
- keep `Auto` default
- add short one-line hints only where needed

### 2. Watcher churn

If profile changes recreate watchers incorrectly, updates may stop or duplicate.

Mitigation:

- keep watcher lifecycle in one place
- always dispose the previous subscription before starting the next one

### 3. Premature complexity in `Auto`

Trying to make `Auto` fully smart too early would slow delivery.

Mitigation:

- start with a fixed balanced config
- evolve only after real usage feedback

## Completion criteria

This plan is complete when:

- a new trip can be started with one of four recording profiles
- `Auto` is the default
- the selected profile is stored on the trip and active recording session
- the active profile is visible on the recording screen
- the user can change the profile while recording without stopping the trip
- changing the profile reconfigures location watching in place
