# PLAN 61: AUTO-Only Recording Runtime

## Goal

Make new recordings unconditionally AUTO at runtime.

The user no longer chooses a recording mode when starting a trip. Trailbook starts
with a unified native background tracking baseline and infers logical route
segments (`walk`, `bike`, `drive`, `stationary`, etc.) from raw location events.

## Problem

The UI already hides manual mode selection, and native tracking no longer reads
server-side per-profile config. However, the runtime still contains old manual
recording branches:

- `RecordingDraftInput.recordingMode`
- start-recording service/controller parameters that accept manual modes
- `getConcreteRecordingProfileForMode(recordingMode)`
- `getBackgroundTrackingProfile(recordingMode, profile)` manual branches
- tests that assert non-AUTO behavior
- recovery paths that recreate session `recordingMode` from active segment profile

This makes Android recording failures harder to reason about because multiple
code paths still decide what “current mode” means.

## Product Decision

For all new recordings:

```text
recordingMode = auto
initial recordingProfile = walk
native tracking profile = unified AUTO baseline
segments = inferred output profiles
```

Manual mode selection is removed from the runtime path.

## Key Distinction

Do not confuse:

- `recordingMode`: recording controller mode. For new/runtime sessions this is
  always `auto`.
- `recordingProfile`: current inferred segment profile. This may be `walk`,
  `bike`, `drive`, `stationary`, etc.
- trip/segment historical profiles: must remain supported for old trips,
  restored trips, shared trips and display.

## Non-Goals

- Do not remove `RecordingMode` from persisted domain types yet.
- Do not migrate old trip/session records in SQLite.
- Do not remove segment profile editing.
- Do not remove `recordingProfile` from trips or segments.
- Do not change AUTO inference thresholds.
- Do not change point-filter behavior.
- Do not remove diagnostics that record `recordingMode`; they can continue to
  report `auto` for new recordings.

## Target Runtime Rules

### Start Recording

Start input should contain only:

- title
- optional description

It should not contain:

- `recordingMode`
- manually selected `recordingProfile`

The controller/service should internally set:

```ts
recordingMode: "auto"
recordingProfile: DEFAULT_RECORDING_PROFILE // walk
```

### Native Location Tracking

Native tracking should not branch on manual modes.

Target:

```ts
getBackgroundTrackingProfile(...) => DEFAULT_RECORDING_PROFILE
```

or remove the function and make the caller explicit:

```ts
const backgroundTrackingProfile = DEFAULT_RECORDING_PROFILE;
```

The important rule: native tracking remains the same while AUTO inference changes
logical segments.

### Session Recovery

If an existing local session has:

```ts
recordingMode: "walk" | "bike" | "drive" | ...
```

normalize it to:

```ts
recordingMode: "auto"
recordingProfile: old recordingMode/profile fallback
```

Reason: runtime controller should only process AUTO sessions, but we should not
lose the current inferred profile if a user has an old in-progress session.

### Trip Resume / Restore Helpers

Any helper that rebuilds recording session state from a trip/segment should set
runtime `recordingMode` to `auto`.

It may still set `recordingProfile` from the active/open segment.

## Mobile Work

### Recording Draft / Start Modal

Update:

- `mobile/src/screens/recording/recording-screen.controller.ts`
- `mobile/src/screens/recording/components/recording-start-modal.tsx`
- any `RecordingDraftInput` type/model

Tasks:

1. Remove `recordingMode` from the draft input type.
2. Remove any remaining mode labels or selection state from the start modal.
3. Ensure start button still works with title/description only.
4. Ensure default draft no longer needs a hidden mode field.

### Recording Service

Update:

- `mobile/src/services/recording/recording.service.ts`

Tasks:

1. Remove `recordingMode` from `CreateTripDraft` / start parameters.
2. Set `recordingMode: "auto"` internally.
3. Set initial `recordingProfile` to `DEFAULT_RECORDING_PROFILE`.
4. Remove `getConcreteRecordingProfileForMode` if it becomes unused.
5. Ensure created trip still stores `recordingProfile: "walk"` as initial profile
   and `recordingConfig` snapshot as before.

### Location Service

Update:

- `mobile/src/services/location/location.service.ts`

Tasks:

1. Remove manual branch from `getBackgroundTrackingProfile`.
2. Prefer one explicit function name such as `getUnifiedAutoTrackingProfile`.
3. Keep native tracking options stable.
4. Keep diagnostic payloads clear: if they log `profile`, that means native
   tracking baseline, not inferred segment profile.

### App Layout / Background Sync

Update:

- `mobile/app/_layout.tsx`

Tasks:

1. Remove dependency on `session.recordingMode` for choosing background tracking.
2. Background sync should only care about active trip id and whether session is
   active.
3. The current inferred profile can remain UI state, but must not affect native
   tracking options.

### Recording Screen / Controller

Update:

- `mobile/src/screens/recording/recording-screen.tsx`
- `mobile/src/screens/recording/recording-screen.controller.ts`
- `mobile/src/screens/recording/recording-screen.model.ts`

Tasks:

1. Remove manual-mode assumptions from start flow.
2. Keep displayed active profile based on `recordingProfile`.
3. Continue showing AUTO as the recording mode where useful.
4. Ensure pause/resume/stop still sets session status correctly.
5. Ensure waypoint/note flows are unchanged.

### Stores / Normalizers

Update:

- `mobile/src/state/recording-store.ts`
- `mobile/src/domain/normalize-recording-session.ts`

Tasks:

1. Default session `recordingMode` should be `auto`, not `walk`.
2. Normalize old persisted non-AUTO session modes to `auto` for runtime.
3. Preserve profile fallback in `recordingProfile`.
4. Ensure deleted/idle session state remains valid.

### Trips Screen Recovery Paths

Update:

- `mobile/src/screens/trips/trips-screen.tsx`

Tasks:

1. When reconstructing/restoring current recording state from a trip, set
   `recordingMode: "auto"`.
2. Set `recordingProfile` from active segment/trip profile.
3. Do not use active segment profile as `recordingMode`.

### Simulation

Update:

- `mobile/src/screens/simulation/simulation-screen.tsx`
- `mobile/src/services/simulation/scenario-runner.service.ts`

Tasks:

1. Keep simulations AUTO-only.
2. Remove UI logic that checks manual recording mode if it only exists to block
   simulation.
3. Simulation should continue creating inferred segments.

## Test Work

### Update Existing Tests

Search and adjust tests that explicitly assert non-AUTO runtime behavior:

- `mobile/src/__tests__/services/location.service.test.ts`
- `mobile/src/__tests__/services/auto-recording-batch.service.test.ts`
- `mobile/src/__tests__/services/auto-recording-transition.service.test.ts`
- `mobile/src/__tests__/services/recording-pipeline-batch.service.test.ts`
- controller/service tests that build `RecordingSessionSummary`

Rules:

- Tests for legacy normalization may still use non-AUTO input and assert it
  becomes AUTO.
- Tests for AUTO transition no-op when `recordingMode !== "auto"` should be
  removed or moved to a legacy-normalization test. Runtime should not rely on
  non-AUTO sessions.
- Tests for manual native tracking options should be removed.

### Add Regression Tests

Add focused tests:

1. Starting a recording always creates session `recordingMode: "auto"`.
2. Starting a recording always creates initial profile `walk`.
3. Rehydrating old session `{ recordingMode: "drive" }` normalizes to
   `{ recordingMode: "auto", recordingProfile: "drive" }`.
4. Background tracking profile remains stable even when current inferred segment
   changes from walk to drive.

## Backend Work

No backend schema change expected.

Keep accepting `recordingMode` in diagnostics/sync payloads because:

- older mobile builds may still send it
- diagnostics history may contain old values

New mobile should send `auto` for recording-level mode.

## Verification

Run:

```bash
npm run typecheck --workspace mobile
npm run lint --workspace mobile
npm run test --workspace mobile
```

If server DTOs are touched:

```bash
npm run typecheck --workspace server
npm run test --workspace server
```

Manual checks:

1. Start recording dialog only asks for title/description.
2. New recording starts as AUTO.
3. Segment timeline still shows inferred profiles.
4. Android/iOS native background tracking does not restart when inferred profile
   changes.
5. Pause/resume/stop still works.
6. GPS simulation still produces segment changes.

## Acceptance Criteria

- New runtime sessions are always `recordingMode: "auto"`.
- Start recording draft has no mode field.
- Native background tracking selection does not depend on manual mode or inferred
  segment profile.
- Old persisted sessions with non-AUTO modes are normalized safely.
- Segment inference and display still use `recordingProfile`.
- Mobile typecheck/tests pass.

## Follow-Up

After this cleanup, create a separate plan for Android batch processing
performance:

```text
PLAN_62_android_batch_processing_performance
```

That plan should focus on:

- batch processing cost
- transaction boundaries
- diagnostics volume
- raw-event reprocessing overhead
- avoiding multi-minute processing on Android wake batches
