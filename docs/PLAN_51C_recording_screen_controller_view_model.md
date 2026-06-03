# PLAN 51C: Recording Screen Controller And View Model

## Goal

Turn `RecordingScreen` into a renderer, not a recording orchestrator.

The screen currently owns:

- permission status rendering
- foreground location UI
- start/pause/resume/stop control flow
- mode/profile switching
- silent-gap watchdog
- waypoint creation
- camera/photo actions
- demo limits
- map state
- session drawer state
- direct store/storage writes

This makes the screen hard to reason about and makes recording bugs harder to isolate.

## Scope

In scope:

- Add `useRecordingScreenModel`.
- Add `RecordingController` or `recording-screen.use-cases.ts`.
- Move start/pause/resume/stop orchestration out of the component.
- Move waypoint creation and photo attachment orchestration out of the component.
- Keep UI-only state in the screen: modals, selected photo, text drafts, map type.
- Use repository/view-model APIs for active recording snapshot.

Out of scope:

- Rewriting visual design.
- Replacing all stores.
- Native Android watchdog.
- Deterministic processor internals.

## Implementation Status

Updated: 2026-06-03

Completed in this pass:

- Added `recording-screen.model.ts` with `useRecordingScreenModel`.
- Moved store subscriptions and active-trip/segment/waypoint/photo derivation out of `recording-screen.tsx`.
- Added `recording-screen.controller.ts`.
- Moved start/pause/stop/resume/continue recording orchestration into controller functions.
- Controller returns typed action results for user-visible failures; the screen still decides how to show alerts/modals.
- `RecordingScreen` keeps UI-only state such as modals, drafts, selected photo and map type.

Still pending:

- Move recording profile/mode switching into the controller.
- Move waypoint creation and photo attachment orchestration into the controller.
- Introduce an active recording snapshot repository so the model no longer depends on global in-memory arrays.
- Add direct controller unit tests with mocked stores/native adapters.
- Split large render sections into smaller presentational components.

## Proposed Structure

```txt
mobile/src/screens/recording/
  recording-screen.tsx
  recording-screen.model.ts
  recording-screen.controller.ts
  recording-screen.types.ts
```

Alternative if we want to keep screens thinner:

```txt
mobile/src/features/recording-screen/
  use-recording-screen-model.ts
  recording-screen-controller.ts
```

## View Model

`useRecordingScreenModel` should expose prepared render data:

```ts
interface RecordingScreenModel {
  activeTripCard: ActiveTripCardModel | null;
  canStartRecording: boolean;
  currentLocation: CurrentLocationSnapshot | null;
  mapRegion: Region | null;
  missingPermissionsText: string | null;
  pausedTrips: PausedTripModel[];
  recentWaypointCards: RecentWaypointCardModel[];
  recordingControl: RecordingControlModel;
}
```

The screen should not filter all trips/segments/waypoints manually.

## Controller

Controller actions:

```ts
interface RecordingScreenController {
  addWaypoint(input: WaypointDraftInput): Promise<void>;
  attachPhoto(source: "camera" | "library"): Promise<void>;
  changeRecordingMode(mode: RecordingMode): Promise<void>;
  continueInterruptedRecording(): Promise<void>;
  pauseRecording(): Promise<void>;
  resumePausedTrip(tripLocalId: string): Promise<void>;
  startRecording(input: RecordingDraftInput): Promise<void>;
  stopRecording(): Promise<void>;
}
```

Controller may call:

- PermissionManager read/status APIs
- Recording use-cases
- Waypoint/media use-cases
- demo limit services
- native location adapter

Controller must not render UI. It should return typed errors or status events.

## Error Handling

Replace direct `Alert.alert` calls inside deep action code with typed outcomes:

```ts
type RecordingActionResult =
  | { ok: true }
  | { ok: false; reason: "missing_permissions"; message: string }
  | { ok: false; reason: "demo_limit"; message: string }
  | { ok: false; reason: "native_start_failed"; message: string };
```

The screen decides how to show the error.

## Active Recording Snapshot Repository

Add repository API:

```ts
getActiveRecordingSnapshot(userId: string): Promise<ActiveRecordingSnapshot>
```

Snapshot should include only what the screen needs:

- active trip
- active segment
- active points for active trip only
- recent waypoints
- recent waypoint photo attachments
- paused trip summaries

It must not require loading every trip point in local storage.

## Implementation Steps

1. Extract pure selectors from `RecordingScreen` into model helpers.
2. Add `useRecordingScreenModel` using existing stores.
3. Move `handleStartRecording` into controller.
4. Move `handlePauseRecording`, `handleStopRecording`, `handleResumePausedTrip`.
5. Move waypoint/photo actions.
6. Replace direct `Alert.alert` in controller with typed outcomes.
7. Keep screen UI state local.
8. Add tests for controller actions with mocked repositories/native adapters.

## Acceptance Criteria

- `recording-screen.tsx` is mostly render code and local UI state.
- Recording actions can be tested without mounting React.
- Start/stop/pause/resume no longer directly compose raw stores inside the screen.
- Active trip points loaded/rendered only for active trip.
- Camera permission errors are returned as typed action failures.
- No behavioural change in normal recording flow.

## Risks

- Moving logic can accidentally change ordering of writes/native calls.
- A too-large hook can simply move complexity without reducing it.
- Controller should not import React.

## Suggested Order

Do this after PLAN_51B processor work starts but before Android native watchdog.

Reason: a thinner screen makes Android field debugging easier and prevents new watchdog logic from being added to the screen.
