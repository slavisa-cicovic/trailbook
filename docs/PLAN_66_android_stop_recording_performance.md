# PLAN 66: Android Stop Recording Performance

## Problem

On long Android recordings, especially trips longer than about one hour, stopping recording feels too slow.

Observed UX:
- User wakes/activates the screen while recording is active.
- The app first loads/renders the current route on the map.
- During this phase the stop button is still not in loading state, so the user gets no clear feedback that work is happening.
- Only after the map/render phase does the stop button enter loading/processing state.
- The actual processing/loading state is acceptable because the user can see that the app is busy.

The confusing part is the first phase: route loading/rendering blocks or delays visible stop feedback.

## Goals

- Identify where Android stop latency is spent.
- Separate map redraw/UI hydration latency from actual stop-processing latency.
- Make user feedback immediate after tapping stop.
- Preserve current recording accuracy and raw bundle behavior.
- Avoid speculative performance changes without timing data.

## Non-Goals

- Do not change iOS recording behavior.
- Do not change route processing/classification rules.
- Do not remove raw locations or raw bundle data.
- Do not introduce automatic sync.
- Do not optimize based only on short trips, because the issue is visible on long recordings.

## Phase 1: Instrument Real Stop Flow

Add temporary diagnostic timing around the real stop path.

Measure at least:
- `stop_button_pressed`
- `stop_ui_loading_set`
- `stopLocationCapture`
- `insert_RECORDING_STOPPED`
- `getTripBundle`
- `process`
- `replaceSegments`
- `displayRoutePoints_build_replace`
- `updateProcessingVersion`
- `trip_status_update`
- `state_update`
- total stop duration

Log format should be easy to filter from Android logcat:

```text
[Trailbook][stop-performance] { "step": "...", "ms": 123, "tripId": "..." }
```

Acceptance:
- A long Android trip produces enough timing data to identify the dominant cost.
- Logs distinguish UI route loading from stop-processing.

## Phase 2: Make Stop Feedback Immediate

Current visible issue suggests the stop button loading state is set too late or is blocked by route hydration/rendering.

Change behavior so tapping stop immediately:
- disables the stop button,
- shows loading/processing state,
- optionally overlays a small `Stopping recording...` indicator,
- then starts expensive work.

Implementation direction:
- Set local UI state before awaiting any stop work.
- Avoid waiting for route/map reload before showing stop feedback.
- If needed, defer route refresh until after stop completes.

Acceptance:
- On Android, tapping stop immediately changes visible UI state.
- User does not see a silent waiting phase while the map redraws.

## Phase 3: Isolate Map Rendering Cost

If timings show that map hydration/rendering is the first bottleneck:
- Do not refresh or redraw the live route while stop is already in progress.
- Freeze the currently visible route during stop.
- After stop completes, navigate/update to the completed trip state.

Potential changes:
- Guard live route refresh with `if (stoppingTrip) return`.
- Do not rebuild `liveCoordinates` during stop.
- Avoid fitting/animating map while stop is pending.

Acceptance:
- Stop begins without waiting for route redraw.
- Completed trip still displays correct route after stop finishes.

## Phase 4: Simulate Without Long Physical Trip

Add a debug-only simulation path if real trips are hard to reproduce.

Possible implementation:
- Generate a local test trip with synthetic raw locations:
  - 1,000 rows
  - 5,000 rows
  - 10,000 rows
  - 25,000 rows
- Run the same post-capture stop pipeline:
  - bundle read,
  - processing,
  - segment replace,
  - display route generation.
- Exclude `stopLocationUpdatesAsync` from this simulation, because it needs real native capture state.

Acceptance:
- Simulation identifies processing/storage scaling cost.
- Simulation is clearly marked debug-only and not user-facing.

## Phase 5: Optimize Based On Data

Only after Phase 1/4 timings:

If `stopLocationCapture` is slow:
- Inspect Expo Android foreground service stop behavior.
- Add timing around pending callback flush if possible.

If `getTripBundle` is slow:
- Avoid reading data not needed for processing.
- Process from raw locations/activity only, then build full bundle only for sync.

If `process` is slow:
- Profile cleaner/classifier/merger separately.
- Avoid repeated full-array scans.

If `displayRoutePoints_build_replace` is slow:
- Batch inserts in smaller chunks.
- Consider building display route incrementally during recording.
- Keep raw points unchanged.

If UI reload is slow:
- Defer Trips/Trip Details reload until stop completes.
- Avoid triggering multiple `dbEvents` reloads during one stop transaction.

## Validation

Manual validation needs at least one Android trip longer than one hour.

Checklist:
- Stop button enters loading state immediately after tap.
- Stop completes successfully.
- Final route is correct.
- Segments are correct enough for current processing rules.
- No automatic sync is triggered.
- Logs show total stop duration and largest cost center.

## Cleanup

After diagnosis:
- Remove or gate verbose timing logs.
- Keep only useful high-level diagnostics if they help future support.
- Remove simulation UI/entry if it was added only for this investigation.
