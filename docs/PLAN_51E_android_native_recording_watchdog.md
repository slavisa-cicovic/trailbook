# PLAN 51E: Android Native Recording Watchdog

## Goal

Fix Android recording gaps that happen while React Native JavaScript is asleep.

JS watchdogs can only run while the JS runtime is alive. They cannot reliably detect or repair gaps when Android has stopped delivering callbacks until the app wakes up.

This plan is a native Android reliability slice.

## Problem Statement

Observed Android failures:

- app has background location permission
- battery usage can show long background time
- route still has multi-minute gaps
- callbacks can arrive in delayed batches
- sometimes callback delivery appears to stop until app becomes active

The current JS-level watchdog can restart background location only when JS is awake. That is not enough.

## Scope

In scope:

- Add native Android watchdog around background recording.
- Verify foreground service notification/channel behavior.
- Detect no-callback windows natively.
- Restart location request natively if provider is silent.
- Persist native watchdog events for diagnostics.
- Expose watchdog status in support bundle/test-user diagnostics.

Out of scope:

- iOS native changes.
- Replacing Expo Location immediately, unless required.
- Map matching.
- AUTO mode logic changes.
- RecordingScreen UI refactor.

## Architecture Options

### Option A: Native Watchdog Around Expo Location

Keep Expo Location task but add a native module/service that:

- monitors last native callback timestamp
- periodically checks elapsed time
- restarts location updates if stale
- writes watchdog diagnostics

Risk: Expo Location internals may not expose enough control.

### Option B: Dedicated Native Foreground Location Service

Implement Android foreground service directly:

- uses FusedLocationProviderClient
- owns location request
- emits batched locations to JS when available
- persists raw events natively or sends to JS task
- maintains foreground notification

Risk: bigger native implementation, but clearer control.

### Option C: WorkManager Alarm Safety Net

Use WorkManager/AlarmManager only as periodic health check:

- wakes app/service occasionally
- checks last callback
- restarts foreground service if needed

Risk: not precise enough for continuous recording, but useful as recovery.

## Recommended Direction

Start with Option A only if it can prove it restarts Expo Location reliably.

If not, move to Option B.

The long-term production-grade solution is likely Option B because recording is a core product feature and Android OEM behavior varies.

## Native Diagnostic Events

Persist events such as:

- `native_service_started`
- `native_service_stopped`
- `native_location_callback`
- `native_location_batch`
- `native_watchdog_tick`
- `native_watchdog_stale`
- `native_location_restart_requested`
- `native_location_restart_succeeded`
- `native_location_restart_failed`
- `provider_disabled`
- `permission_missing`
- `battery_optimization_not_ignored`

These should be visible in support bundle.

## Data Model

Add optional table:

```sql
recording_native_events (
  local_id TEXT PRIMARY KEY,
  trip_local_id TEXT,
  event_type TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL
)
```

This is not a replacement for raw location events.

It explains native/service behavior.

## Watchdog Rules

Initial thresholds:

- warning if no callback for 2 minutes while recording
- restart attempt if no callback for 3 minutes
- avoid restart more often than once every 2 minutes
- record every restart attempt

Thresholds should be server-configurable later.

## Implementation Steps

1. Audit current Android manifest/service/notification declarations.
2. Add native event table/storage.
3. Add native module that reports foreground service and battery optimization status.
4. Implement native stale-callback monitor.
5. Try restart around Expo Location task.
6. Add diagnostics and support bundle fields.
7. Run field tests with app screen off for walk/bike/drive.
8. If Expo restart is unreliable, implement dedicated native location service.

## Acceptance Criteria

- With app screen off, Android records callbacks continuously enough for bike/drive scenarios.
- If native callback delivery stalls, watchdog records the stall.
- Watchdog restart attempts are visible in diagnostics.
- Support bundle can distinguish:
  - OS delivered no locations
  - native service stopped
  - JS did not process delivered locations
  - filters rejected delivered locations
- iOS behavior is unaffected.

## Field Test Matrix

Test at least:

- Samsung Galaxy S21 5G, unrestricted battery
- Samsung Galaxy S21 5G, optimized battery
- app foreground, screen on
- app background, screen off
- walk only
- bike only
- auto walk-to-bike
- auto walk-to-drive
- 30 minutes minimum per scenario

## Risks

- Native code increases maintenance cost.
- Expo prebuild/native module integration can complicate builds.
- Some OEMs may still throttle aggressively.
- Foreground service notification behavior must satisfy Android policy.

## Success Metric

Android callback count and route continuity should be within acceptable range of iOS for the same route, excluding known GPS quality differences.
