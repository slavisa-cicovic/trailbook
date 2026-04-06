# PLAN 15: Background Recording

## Goal

Move trip point capture from a foreground-only screen watcher to a background-capable location pipeline so recording continues while the app is in the background or the phone screen is locked.

## Why

Current recording works only while the app is active because `RecordingScreen` starts a foreground `watchPositionAsync(...)` subscription. When the app goes to sleep or background, location updates stop and trip distance remains `0` even though trip duration continues.

## Scope

- Add Expo background location task support.
- Persist trip points from a background task, not only from `RecordingScreen`.
- Request and reflect background location permission where needed.
- Update app config for iOS and Android background location.
- Keep the current foreground map experience, but decouple point capture from visible UI.

## Non-goals

- No backend sync changes.
- No battery optimization bypass UX in this pass.
- No advanced motion/activity recognition in this pass.

## Design

### 1. Introduce a background location task

Create a dedicated background task module that:

- defines a stable task name
- registers `TaskManager.defineTask(...)` in module scope
- receives location updates from `Location.startLocationUpdatesAsync(...)`
- resolves the active recording session and active trip from persisted local state
- appends useful trip points into storage/stores
- updates recording session metadata such as `lastPointRecordedAt`

This removes point capture from the lifetime of `RecordingScreen`.

### 2. Split foreground map location from recording location

Keep two concepts separate:

- foreground UI location:
  used for current map centering and live UI feedback while the screen is open
- recording pipeline location:
  used to persist trip points in foreground/background via the background task

`RecordingScreen` can still subscribe to foreground location for immediate map updates, but trip persistence should no longer depend on that watcher.

### 3. Add background permission support

Extend location service to support:

- foreground permission request
- background permission request
- permission status inspection

Recording start flow should ensure:

- foreground permission exists
- background permission is requested before enabling background trip capture

If background permission is denied, we should block true background recording and clearly keep the session foreground-only for now rather than silently pretending it works.

### 4. Start and stop background location updates with recording lifecycle

When recording starts:

- create trip
- create recording session
- start background location updates using the selected recording profile

When recording profile changes:

- restart background location updates with the new tracking options

When recording stops:

- stop background location updates
- close active trip
- reset recording session

When interrupted/resumed:

- resume should ensure background tracking is started again
- interrupted state should preserve enough state for re-entry/reconciliation

### 5. Update config for native background location

Update Expo config/plugin usage so native builds include required background location capabilities.

For iOS:

- background location usage descriptions
- location background mode support

For Android:

- background location permission support
- foreground service configuration if required by Expo/native behavior

### 6. Reconcile hydrated state safely

On app launch/hydration:

- reconcile whether a recording session exists
- reconcile whether background tracking is running when it should be
- avoid duplicate point capture if both foreground UI and background task are active

The background task remains the source of truth for persisted points.

## Implementation Steps

1. Add `expo-task-manager` dependency and create a dedicated background recording task module.
2. Extend location service with:
   - background permission requests
   - start/stop background location updates
   - task registration helpers
3. Extend app config for background location support.
4. Refactor recording flow so start/stop/resume/profile-change controls background tracking lifecycle.
5. Move point persistence logic out of `RecordingScreen` effect into the background task pipeline.
6. Keep a lightweight foreground watcher only for live map/UI state if still needed.
7. Test `typecheck` and manual behavior expectations.

## Expected Result

- Trip recording continues while the phone is locked or the app is in background.
- Distance and route points are captured on both actively used and sleeping devices.
- `RecordingScreen` becomes a view/controller for the session, not the engine that keeps the trip alive.
