# PLAN 62: Recording Profile Terminology Cleanup

## Goal

Clean up remaining mobile naming that still suggests user-selectable recording
modes.

After PLAN 61, runtime recording is AUTO-only. The app still stores and displays
movement profiles (`walk`, `bike`, `drive`, `stationary`, etc.), but those are
segment/output profiles, not start-recording modes.

Target terminology:

```text
recording mode = AUTO controller mode, always auto for runtime
recording profile = inferred/manual-corrected segment profile
point filter profile = profile-specific filtering thresholds
```

## Problem

The behavior is now AUTO-only, but code still has confusing names:

- `RECORDING_PROFILE_OPTIONS` includes `auto`
- `getRecordingProfileLabel` accepts `RecordingMode`
- point-filter functions use parameter names like `recordingMode` while their
  type is actually `RecordingProfile`
- settings screens use names such as `mode` / `EDITABLE_MODES` for profile
  configuration
- diagnostics still expose `recordingMode`, which is valid for historical/API
  compatibility but should not leak into new runtime decisions

This makes future Android recording work harder because "mode" can mean at least
three different things.

## Non-Goals

- Do not remove the persisted `recordingMode` field from recording sessions yet.
- Do not change server DTOs or database columns in this plan.
- Do not migrate historical diagnostics or trip records.
- Do not change AUTO inference thresholds.
- Do not change point-filter values.
- Do not remove segment profile editing.
- Do not remove diagnostics sync.

## Target Rules

### Profile Options

`RECORDING_PROFILE_OPTIONS` should only contain segment profiles:

- `walk`
- `bike`
- `drive`
- `boat`
- `plane`
- `stationary`

AUTO should be represented separately when the UI needs an AUTO label.

### Labels

Use explicit helpers:

```ts
getRecordingProfileLabel(profile: RecordingProfile)
getRecordingModeLabel(mode: "auto")
```

If a legacy `RecordingMode` value must be displayed, normalize it explicitly at
the boundary instead of making profile helpers accept mode values.

### Point Filtering

Point filtering should use `recordingProfile` terminology:

```ts
appendTripPointIfUseful(..., recordingProfile, ...)
getMaxAccuracyMeters(recordingProfile)
getMaxJumpDistanceMeters(recordingProfile)
getMaxImpliedSpeedKmh(recordingProfile)
getMinMovementMeters(recordingProfile)
```

No threshold behavior should change.

### Diagnostics

Diagnostics may keep the field name `recordingMode` for compatibility with:

- existing local storage rows
- server sync DTOs
- support bundle exports

But new runtime call sites should pass `"auto"` when the field means controller
mode, and pass `recordingProfile` only to point-filter/decision helpers.

## Mobile Work

### Recording Profile Constants

Update:

- `mobile/src/constants/recording-profiles.ts`

Tasks:

1. Split AUTO from segment profile options.
2. Make `RecordingProfileOption.value` a `RecordingProfile`.
3. Add a small AUTO label helper/constant if needed.
4. Change `getRecordingProfileLabel` to accept only `RecordingProfile`.
5. Remove exported `normalizeRecordingMode` if it is no longer used.
6. Keep legacy profile normalization for imported/restored data.

### Settings Screens

Update:

- `mobile/src/screens/settings/recording-config-screen.tsx`
- `mobile/src/screens/settings/recording-config-profile-screen.tsx`

Tasks:

1. Rename local variables from `mode` to `profile` where they refer to point
   filter profiles.
2. Rename `EDITABLE_MODES` to `EDITABLE_PROFILES`.
3. Ensure profile picker no longer needs to filter out `auto`.
4. Keep `stationary` non-configurable unless explicitly required later.

### Recording Screen Labels

Update:

- `mobile/src/screens/recording/recording-screen.model.ts`

Tasks:

1. Keep active label as `Auto • {profile label}`.
2. Use the profile label helper only for the inferred active profile.
3. Do not reintroduce manual mode state.

### Trip / Segment UI

Update if type changes require it:

- `mobile/src/screens/trips/trip-route-screen.tsx`
- `mobile/src/screens/trips/shared-trip-screen.tsx`
- `mobile/src/screens/trips/components/segment-edit-modal.tsx`
- `mobile/src/services/trip-segments/trip-segments.service.ts`

Tasks:

1. Use profile-only label helper.
2. Keep segment profile editing behavior unchanged.
3. Preserve mixed-profile route labels.

### Point Filtering Service

Update:

- `mobile/src/services/trip-points/trip-points.service.ts`

Tasks:

1. Rename function parameters from `recordingMode` to `recordingProfile`.
2. Keep all thresholds and diagnostics reasons unchanged.
3. Ensure call sites are clearer: controller mode is not being used for point
   acceptance.

### Diagnostics Boundaries

Update only where naming is misleading:

- `mobile/src/domain/trip-diagnostics.ts`
- `mobile/src/storage/trip-diagnostics-storage.ts`
- `mobile/src/services/trip-points/trip-point-diagnostics.service.ts`
- `mobile/src/services/trips/server-trip-sharing.service.ts`
- `server/src/trips/dto/sync-trip.dto.ts` only if type naming can be clarified
  without API change

Tasks:

1. Keep serialized field name `recordingMode`.
2. Add comments or local type aliases if needed to document that it is a legacy
   diagnostic controller-mode field.
3. Do not change JSON shape sent to backend in this plan.

## Test Plan

Run from `mobile/`:

```bash
npm run typecheck
npm run test
npm run lint
```

Expected:

- Typecheck passes.
- Existing tests pass.
- Lint has no new warnings from this plan.
- Existing unrelated photo-viewer warnings may remain if not addressed in this
  plan.

## Manual Validation

1. Start a new recording.
2. Confirm the start dialog still asks only for route name/description.
3. Confirm active session label still reads `Auto • Walk` initially.
4. Run GPS simulation and confirm segment profiles still change.
5. Open recording config settings and confirm it reads as profile/point-filter
   configuration, not recording mode selection.

## Acceptance Criteria

- No runtime code uses `recordingMode` as a point-filter or segment-profile
  input.
- Profile helpers do not accept `auto` unless explicitly named as mode helpers.
- Settings terminology is profile/filter oriented.
- Diagnostics keep wire/storage compatibility.
- No recording behavior changes.

## Rollback

This is a naming/type-boundary cleanup. Rollback is safe by reverting the commit
if type changes cause unexpected UI or diagnostics issues.
