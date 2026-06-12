# PLAN 59: Stationary Auto Segments

## Goal

Add a non-moving segment type to AUTO recording.

User-facing label: `Pause`.

Internal recording profile value: `stationary`.

This represents an active recording period where the user is not meaningfully
moving. It is not the same as `TripPause`, which means the user explicitly paused
recording.

## Problem

AUTO mode currently classifies route sections as movement profiles:

- `walk`
- `bike`
- `drive`
- `boat`
- `plane`

When the user stops during an active recording, the stationary interval is usually
absorbed into the previous movement segment. Example:

`Walk -> Bike -> Pause -> Walk`

currently tends to become:

`walk -> bike -> walk`

with the pause time included in the bike segment duration.

This makes the timeline less truthful and makes segment stats harder to interpret.

## Key Decision

Use `stationary` internally, not `pause`.

Reason: the app already has `TripPause`.

- `TripPause`: explicit user action; recording is paused.
- `stationary` segment: automatic inference; recording is still active, raw
  locations continue to be processed.

The UI should display `stationary` as `Pause`.

## Non-Goals

- Do not reintroduce manual recording mode selection.
- Do not make `stationary` a native location tracking profile.
- Do not stop background location while a stationary segment is active.
- Do not remove or replace `TripPause`.
- Do not add server-side recomputation of stats.

## Data Model

### Mobile

Update:

- `mobile/src/domain/trips.ts`
- `mobile/src/constants/recording-profiles.ts`
- `mobile/src/services/api/schemas/shared-trips.schemas.ts`
- any local validation/normalization code that enumerates `RecordingProfile`
- recording config key lists, only if the profile type requires exhaustiveness

`RecordingProfile` becomes:

```ts
type RecordingProfile = "walk" | "bike" | "drive" | "boat" | "plane" | "stationary";
```

Important: `stationary` must be accepted in stored trips/segments, sync payloads,
shared trips and restore payloads.

### Backend

Update:

- `server/prisma/schema.prisma`
- server sync DTOs
- server shared-trip DTOs / response mappings
- server recording config types only if they enumerate profiles

Add Prisma enum value:

```prisma
enum RecordingProfile {
  walk
  bike
  drive
  boat
  plane
  stationary
}
```

DB update required after implementation:

```bash
npm run prisma:push --workspace server
```

## UI

### Segment Labels

Add profile metadata:

- value: `stationary`
- label: `Pause`
- description: `Stationary`
- color: neutral gray / amber

The segment timeline should show `Pause`, not `Stationary`.

### Recording Start

No UI change. Start remains AUTO-only.

### Recording Config Screens

Do not expose `stationary` as a configurable native tracking profile unless the
existing type system forces it. If it must be present in config maps, make it an
alias of `walk` for point-filter fallback only.

## Recording Pipeline Design

### Critical Rule

`stationary` is a logical output segment, not a tracking/filter profile.

When active segment is `stationary`, the pipeline must still evaluate incoming raw
events for movement transitions. It must not get stuck rejecting new movement
points because the current segment profile is stationary.

Practical approach:

- native tracking profile remains the unified AUTO tracking profile
- point acceptance for stationary should use conservative walk-like thresholds
  when needed
- AUTO inference should always inspect raw callback windows before applying
  current-segment filters

## Stationary Detection

Add stationary inference before movement fallback.

Candidate criteria:

- window duration at least 2-3 minutes
- at least 4 raw samples
- median speed below stationary threshold
- displacement between first and last point below a small radius
- max point-to-point speed does not indicate real movement

Suggested initial thresholds:

```ts
STATIONARY_STABILITY_MS = 2 * 60 * 1000
STATIONARY_MAX_MEDIAN_KMH = 2
STATIONARY_MAX_DISPLACEMENT_METERS = 35
STATIONARY_MAX_ACCEPTED_DISTANCE_METERS = 60
```

These are starting points. Tune with GPS simulation and real Android traces.

### Transition Rules

Movement -> stationary:

- only create stationary after the candidate window is stable
- segment start should be the beginning of the stationary window, not the time
  when the decision is confirmed
- previous movement segment should end at the stationary start

Stationary -> movement:

- movement must be stable enough to avoid jitter
- close stationary at the first movement candidate timestamp
- open the inferred movement segment (`walk`, `bike`, `drive`, etc.)

Stationary -> stationary:

- keep same segment open

Short stationary windows:

- do not create a stationary segment for short traffic-light / photo stops unless
  threshold is met
- this prevents noisy timelines

## Batch Processing

Android sleep batches need explicit support.

For `buildAutoBatchProfileSections`:

- classify chronological raw samples into sections
- include `stationary` sections when a stable low-movement run is detected
- preserve order, e.g.:

```text
walk -> bike -> stationary -> walk
```

Batch section start/end should come from raw sample timestamps.

## Stats

TripSegment stats for stationary:

- `durationMs`: real stationary interval
- `pointCount`: accepted anchor points, usually low
- `distanceMeters`: should remain near zero

Trip total distance:

- stationary segment should not inflate distance
- segmented distance calculation should continue summing per-segment distance

## Sync / Restore

Sync payloads must include `stationary` segment profiles.

Restore must accept `stationary` from backend.

Shared trips must accept and render `stationary`.

Old clients without `stationary` support may fail if they restore new trips. This
is acceptable during development, but should be called out before wider release.

## Tests

### Unit Tests

Add/update tests for:

- `normalizeRecordingProfile("stationary")`
- `getRecordingProfileLabel("stationary")`
- `getRecordingProfileColor("stationary")`
- `inferAutoRecordingProfile` stationary detection
- batch section builder produces:
  - `walk -> bike -> stationary -> walk`
  - `walk -> drive -> stationary -> walk`
  - stationary-only scenario
- transition service:
  - movement -> stationary
  - stationary -> movement
  - short stationary window ignored

### Simulation Tests

Use existing GPS simulation:

- `Stationary (GPS jitter)`
  - expected: one `Pause`/`stationary` segment or one zero-distance stationary
    timeline entry, depending on final UX decision
- `Walk -> Bike -> Pause -> Walk`
  - expected: `walk -> bike -> stationary -> walk`
- Add or inspect:
  - `Walk -> Drive -> Pause -> Walk`
  - `Drive -> Stationary -> Drive`

### Real Device Tests

Android:

- active app transition scenario
- screen-off sleep batch scenario
- verify raw events are still delivered/processed

iOS:

- equivalent simulation matrix
- one short real walk/stop/walk route

## Implementation Phases

### Phase 1: Type and Sync Surface

1. Add `stationary` to mobile `RecordingProfile`.
2. Add label/color metadata.
3. Add backend Prisma enum value.
4. Add `stationary` to server DTO literal unions and schemas.
5. Add `stationary` to shared/restore schemas.
6. Run typecheck.

Acceptance:

- app compiles with `stationary` accepted everywhere a segment profile can be
  loaded/synced/rendered
- no AUTO behavior changed yet

### Phase 2: Inference

1. Add stationary detection helper based on raw sample window.
2. Add tests for stationary inference.
3. Ensure movement profiles still win when speed/displacement clearly indicate
   movement.

Acceptance:

- stationary can be inferred from stable low-movement windows
- walk/bike/drive inference regressions do not occur

### Phase 3: Transition and Batch Sections

1. Update live AUTO transition logic to create/close stationary segments.
2. Update batch section builder for Android sleep batches.
3. Ensure `stationary` never causes native tracking restart/config changes.
4. Ensure `stationary` uses walk-like point acceptance when an anchor point is
   needed.

Acceptance:

- simulation `Walk -> Bike -> Pause -> Walk` becomes
  `walk -> bike -> stationary -> walk`
- Android sleep batch scenarios remain correct

### Phase 4: Stats / Timeline Polish

1. Ensure segment timeline renders `Pause`.
2. Ensure stationary distance is near zero.
3. Ensure stationary duration is visible.
4. Decide whether a fully stationary trip should show one `Pause` segment or
   stay as a single zero-distance walk segment.

Acceptance:

- route screen timeline is understandable
- trip distance is not inflated by stationary segments

### Phase 5: End-to-End Validation

1. Run mobile unit tests.
2. Run typecheck/lint.
3. Run simulation matrix on iOS and Android.
4. Sync and restore simulation trips.
5. Verify backend accepts and returns `stationary` segments.

Acceptance:

- sync/restore works
- simulation output matches expected segment sequences
- no manual mode UI returns

## Risks

- Adding a Prisma enum value requires DB migration/push. Existing DB state should
  be safe, but older clients cannot parse new profile values.
- If stationary detection is too aggressive, traffic lights or short photo stops
  can fragment the timeline.
- If stationary detection is too conservative, pause intervals remain absorbed
  into previous movement segments.
- `stationary` must not become a native tracking profile; otherwise we risk
  reintroducing Android callback/drop issues.

## Open Decisions

1. Fully stationary trip timeline:
   - show `Pause` segment, or
   - keep a minimal zero-distance `walk` segment?

Recommended: show `Pause`, because it is truthful and helps diagnostics.

2. Minimum stationary duration:
   - start at 2 minutes for simulation/dev
   - tune after Android real-device tests

3. Should stationary segments be synced to backend immediately?
   - yes, same as any segment
