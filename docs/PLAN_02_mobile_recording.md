# PLAN 02: Mobile Recording Structure

## Goal

Refactor the current mobile app scaffold into a structure that can support real recording, local persistence, and later sync work without pushing domain and storage logic into UI files.

This plan adopts the useful parts of the `wm-mobile` pattern:

- thin route layer
- screen-oriented implementation
- explicit state layer
- explicit service layer
- reusable UI and layout components

## Why now

The mobile app is still small.
This is the cheapest moment to establish a structure that can carry:

- temporary local login/session
- user and device bound recording
- local trip persistence
- later sync orchestration

If we keep growing from the current single-screen scaffold, recording logic, session persistence, and UI state will collapse into one place and become expensive to untangle later.

## Target structure

### Expo routing layer

Use `app/` as the route layer only.

Suggested files:

- `mobile/app/_layout.tsx`
- `mobile/app/index.tsx`
- `mobile/app/login.tsx`
- `mobile/app/recording.tsx`
- `mobile/app/trips.tsx`
- `mobile/app/settings.tsx`

Rules:

- route files should stay thin
- route files should mostly render screen components
- route files should not contain business logic

### Source layer

Suggested `src/` structure:

- `src/screens/`
- `src/components/`
- `src/state/`
- `src/services/`
- `src/storage/`
- `src/domain/`
- `src/hooks/`
- `src/theme/`
- `src/constants/`

### Screen structure

Suggested screen folders:

- `src/screens/auth/`
- `src/screens/recording/`
- `src/screens/trips/`
- `src/screens/settings/`

### Component structure

Suggested component folders:

- `src/components/ui/`
- `src/components/layout/`

## Intended responsibilities

### `app/`

- Expo Router entry points
- navigation shell
- redirects and route guards only

### `src/screens/`

- screen composition
- screen-local view logic
- interaction wiring to stores and services

### `src/state/`

- hydrated local app state
- active session state
- active recording state
- store interfaces that screens consume

### `src/services/`

- orchestration that should not live in components
- start/stop recording flows
- future sync trigger flows
- future auth transition logic

### `src/storage/`

- AsyncStorage adapters
- future local DB adapters
- persistence serialization/deserialization

### `src/domain/`

- `identity`
- `trip`
- `trip point`
- `waypoint`
- recording/session summaries

## Proposed implementation phases

### Phase 1: Route and screen split

Move the current app entry out of `src/app/App.tsx` and establish route-driven screen composition.

Planned changes:

- add Expo Router dependency and route entry
- create `app/_layout.tsx`
- create `app/index.tsx` redirect
- create `app/login.tsx`
- create `app/recording.tsx`
- move current UI into screen files under `src/screens/...`

Exit criteria:

- app boots through Expo Router
- route files stay thin
- existing functionality still works

### Phase 2: State extraction

Move session and recording state out of screen-local React state into explicit stores.

Planned changes:

- create `src/state/session-store.ts`
- create `src/state/recording-store.ts`
- move hydrate/persist logic out of screen components
- keep screens focused on rendering and user interaction

Exit criteria:

- session hydration no longer lives inside the screen component
- recording state is controlled through a store API
- screen files become noticeably smaller

### Phase 3: Service extraction

Create service boundaries for flows that will later grow.

Planned changes:

- create `src/services/auth/temporary-login.service.ts`
- create `src/services/recording/recording.service.ts`
- move `start/stop recording` orchestration out of the screen

Exit criteria:

- screens call services or stores instead of assembling domain transitions inline
- user/device-bound recording setup stays explicit

### Phase 4: Local trip persistence

Replace purely UI-level recording with first local trip creation.

Planned changes:

- create first local trip record on recording start
- store `userId` and `deviceId` on trip creation
- prepare storage boundary for `TripPoint` persistence
- keep implementation conservative and local-first

Exit criteria:

- starting recording creates a local trip entity
- stopping recording closes the local trip session
- persisted recording state references real local trip data

### Phase 5: Recording screen refinement

Make the recording screen clearer and more useful without overbuilding it.

Planned changes:

- show active user
- show active device
- show recording status
- show active trip id
- show last point time
- make start/stop actions obvious

Exit criteria:

- user can understand whether recording is active
- screen reflects the bound user/device context clearly

## First files to introduce

Expected first-pass file set:

- `mobile/app/_layout.tsx`
- `mobile/app/index.tsx`
- `mobile/app/login.tsx`
- `mobile/app/recording.tsx`
- `mobile/src/screens/auth/login-screen.tsx`
- `mobile/src/screens/recording/recording-screen.tsx`
- `mobile/src/state/session-store.ts`
- `mobile/src/state/recording-store.ts`
- `mobile/src/services/auth/temporary-login.service.ts`
- `mobile/src/services/recording/recording.service.ts`

## Decisions for this phase

- keep login temporary and local for now
- treat `email + password` as valid input if both are present
- persist the active user/device session locally
- require an active user/device context before recording starts
- do not introduce full backend auth yet
- do not introduce full sync yet
- do not introduce a heavy state architecture if simple store modules are enough

## Risks

- introducing Expo Router now changes the app entry path and needs a careful, minimal migration
- adding too many folders before enough code exists can create empty structure noise
- putting recording logic into a generic store too early can hide domain behavior

## Validation

For each phase, run the smallest relevant checks:

- mobile typecheck
- Expo config validation
- manual app start
- manual verification that session persistence still survives restart

## Out of scope

Not part of this plan:

- backend auth integration
- trip sync implementation
- trip list/history implementation
- waypoint creation flow
- background location recording
- geo accuracy filtering

## Execution order

Recommended execution order:

1. route and screen split
2. state extraction
3. service extraction
4. first local trip persistence
5. recording screen refinement

This keeps the refactor controlled while preserving working behavior at each step.
