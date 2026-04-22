# PLAN 44: Motion-Activity-Assisted Auto Mode

## Goal

Improve automatic transport mode inference by combining:
- location-derived speed and trajectory heuristics
- Android Activity Recognition
- iOS Core Motion activity classification

The target outcome is a more reliable distinction between:
- `walk`
- `bike`
- `drive`
- `stationary`

especially in real-world situations such as:
- traffic lights
- urban congestion
- short waits
- slow driving
- stop-and-go cycling

## Problem

The current auto mode is driven almost entirely by location-based heuristics in:
- `mobile/src/services/recording/auto-recording.service.ts`

This works for clear high-speed cases, but it breaks down in ambiguous situations:
- city driving may look like walking if speed is low enough
- cycling in traffic may look like walking
- short stops distort speed-based windows
- location quality issues amplify classification errors

We already know from testing that:
- location alone is not a stable enough signal for reliable transport inference
- even after GPS filtering improvements, mode inference can still be semantically wrong

## Product decision

Introduce platform motion/activity APIs as strong hints, not as the only source of truth.

The final mode decision should use sensor fusion:
- motion/activity classification
- location speed
- trajectory continuity
- stability over time

This means:
- platform activity signals can bias inference strongly
- but they should not blindly override impossible location evidence

## Non-goals

- Do not replace the existing location heuristics entirely.
- Do not add a new user-facing permissions flow beyond what is required.
- Do not redesign trip editing or trip sync in this slice.
- Do not attempt advanced ML classification.

## Platform APIs

### Android

Use Activity Recognition / Transition APIs to detect:
- `IN_VEHICLE`
- `ON_BICYCLE`
- `WALKING`
- `STILL`

This requires:
- Android activity recognition permission
- native integration or an Expo-compatible native bridge

### iOS

Use `Core Motion` via `CMMotionActivityManager` to detect:
- `walking`
- `cycling`
- `automotive`
- `stationary`

This requires:
- native integration
- appropriate motion usage description in app config / Info.plist

## Architecture

### 1. Add a shared motion activity domain model

Introduce a cross-platform domain type, for example:
- `MotionActivityType = "walk" | "bike" | "drive" | "stationary" | "unknown"`

And a normalized event shape:
- `type`
- `confidence`
- `recordedAt`
- `sourcePlatform`

This keeps Android and iOS specifics out of the higher-level auto mode logic.

### 2. Introduce a motion activity service

Create a mobile service layer that:
- subscribes to platform motion/activity updates
- normalizes them into a shared internal format
- exposes the latest stable motion signal to recording logic

Recommended location:
- `mobile/src/services/motion/`

Potential files:
- `motion-activity.service.ts`
- `android-motion-activity.native.ts`
- `ios-motion-activity.native.ts`

### 3. Persist recent motion activity state in recording session

Extend the recording session model so auto mode can access:
- current motion candidate
- when that candidate started
- confidence / stability metadata

This should mirror how we already track auto-mode candidates for location-only inference.

### 4. Add motion-assisted inference rules

Update `auto-recording.service.ts` so inference becomes fusion-based.

Recommended behavior:

- if motion says `automotive` with stable confidence:
  - heavily bias toward `drive`
  - even when short-term speed dips due to traffic

- if motion says `cycling`:
  - heavily bias toward `bike`
  - especially in the `8-20 km/h` ambiguity band

- if motion says `walking`:
  - bias toward `walk`
  - but still reject if sustained speed is clearly incompatible

- if motion says `stationary`:
  - do not force a segment transition by itself
  - use it as evidence to avoid premature mode switches

### 5. Keep location heuristics as safety rails

Motion signals can be noisy, so retain:
- speed window checks
- stability durations
- long-gap behavior
- segment normalization

The intent is:
- motion assists
- location validates

Not:
- motion completely overrides

## Recommended fusion strategy

### Priority model

Use a weighted decision model rather than simple precedence.

Example V1 intuition:
- motion hint contributes strong prior
- speed window contributes strong validation
- long stationary periods reduce volatility

### Ambiguous bands

These are the areas where motion activity should help most:

- `3-8 km/h`
  - walk vs slow bike vs stop-and-go drive

- `8-20 km/h`
  - bike vs congested drive

- `0-5 km/h`
  - stationary vs traffic stop vs walk

### Stability

Do not switch mode on a single motion event.

Require:
- stable motion signal over a minimum duration
- or repeated consistent events

This matches the current philosophy of stability windows in auto mode.

## Permissions and app config

### Android

Add activity recognition permission support for native builds.

This may require:
- manifest permission
- runtime permission handling for Android 10+

### iOS

Add the required motion usage description to app config / native plist.

If motion permission is denied:
- app should gracefully fall back to the current location-only inference

## Failure and fallback behavior

If motion activity is unavailable:
- continue using current location-only inference

If motion activity is temporarily unknown:
- keep current mode unless location evidence strongly supports a switch

If platform APIs fail or permissions are denied:
- do not block recording
- only reduce inference quality back to the current baseline

## Diagnostics

Because we already invested in trip diagnostics, extend them carefully to include:
- latest motion-assisted decisions
- motion source availability
- whether a mode switch was:
  - location-only
  - motion-assisted
  - motion-dominant

Do not sync raw motion event streams in V1.
Summary-level diagnostics are enough.

## Validation strategy

Test at least these real-world scenarios on both platforms:

1. city driving with frequent stops  
Expected:
- remains `drive`
- does not collapse to `walk`

2. urban cycling in mixed traffic  
Expected:
- trends to `bike`
- not `walk`

3. walking with short stops  
Expected:
- stays `walk`

4. stop-and-go congestion in a car  
Expected:
- stays `drive`

5. permission denied fallback  
Expected:
- recording still works
- inference falls back to location-only behavior

## Risks

### Risk: increased native complexity

This slice adds real native/platform work on both Android and iOS.

Mitigation:
- keep the shared interface thin
- isolate platform-specific code under `services/motion`

### Risk: permission friction

Additional permissions can reduce UX quality.

Mitigation:
- request only when auto mode is actually used
- degrade gracefully if denied

### Risk: platform inconsistency

Android and iOS may classify the same situation differently.

Mitigation:
- normalize to shared internal activity types
- still validate with speed/location heuristics

## Delivery slices

### Slice 1

Android Activity Recognition integration only:
- permission
- native bridge
- normalized motion events
- auto mode consumes Android motion hints

### Slice 2

iOS Core Motion integration:
- native bridge
- normalized motion events
- fallback-safe integration

### Slice 3

Cross-platform fusion tuning:
- threshold calibration
- diagnostics summary enrichment
- real-world retesting

## Expected outcome

After this plan:
- `auto mode` should stop relying on speed alone
- `drive` should survive congestion and red lights
- `bike` should be easier to distinguish from `walk`
- platform-native activity knowledge should materially improve mode inference quality

## Relevant existing code

- `mobile/src/services/recording/auto-recording.service.ts`
- `mobile/src/services/location/location.service.ts`
- `mobile/src/services/recording/background-recording-task.ts`
- `mobile/src/screens/recording/recording-screen.tsx`
- `mobile/src/domain/trips.ts`
- `mobile/app.config.js`
