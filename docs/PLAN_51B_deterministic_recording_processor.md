# PLAN 51B: Deterministic Recording Processor

## Goal

Replace the current live-only recording pipeline with one deterministic processor that can be used by:

- live background callbacks
- Android batched callbacks
- GPS simulation
- raw event reprocessing
- future repair/backfill tools

The core problem is that recording logic is currently split between `RecordingEngine`, `recording-pipeline.service.ts`, `raw-event-reprocessing.service.ts`, AUTO helpers, storage helpers and screen-level stop/pause normalization.

This makes Android issues hard to reason about because the live path and replay path can produce different results.

## Target Rule

Raw events are input.

Trip points, segments, session state, diagnostics and stats are derived output.

The same raw event sequence with the same config must always produce the same derived output.

## Scope

In scope:

- Extract a pure `RecordingProcessor`.
- Introduce a `RecordingUnitOfWork` executor for persisted writes.
- Make live processing and raw reprocessing call the same processor.
- Move AUTO batch/profile decisions into processor input/output state.
- Keep native location start/stop outside the pure processor.
- Keep UI stores updated only after successful persistence.

Out of scope:

- Android native watchdog.
- Map matching.
- Offline maps.
- Full RecordingScreen rewrite.
- Full sync outbox migration.

## Implementation Status

Updated: 2026-06-03

Completed in this pass:

- Added `recording-processor.service.ts` as the shared deterministic raw replay processor.
- Added lightweight `raw-location-event-processing.service.ts` for raw event sorting/status derivation without Expo/native dependencies.
- Added `recording-unit-of-work.service.ts` as a central executor for applying raw reprocessing output through existing storage APIs.
- Converted raw event route reprocessing to call the shared processor instead of keeping a separate replay implementation.
- Converted live raw event status derivation in `recording-engine.service.ts` to use the shared raw status helper.

Still pending:

- Convert the live background callback path itself from `recording-pipeline.service.ts` to the deterministic processor.
- Move native profile restart requests out of the pipeline into a transition adapter.
- Add fixture tests for real Android batched walk/bike/drive scenarios.
- Replace remaining direct store writes inside `recording-pipeline.service.ts` with a full unit-of-work commit path.

## Current Problems

### Pipeline Owns Too Much

`recording-pipeline.service.ts` currently:

- loads trips, segments, waypoints and points
- runs AUTO mode logic
- filters points
- changes segments
- writes stores/storage
- restarts native tracking on transition
- tracks rejected recovery buffers
- sets batch overlay UI state

This is too much for one service and makes testing incomplete.

### Replay Is Not Guaranteed Equivalent

Raw reprocessing has a separate replay model. It can improve existing trips, but it is not guaranteed to match live processing exactly.

### Writes Are Not Atomic Enough

Session, trip points, segments, waypoints, diagnostics and stats can be updated through separate calls. If the app dies mid-write, state can become inconsistent.

## Proposed Architecture

### RecordingProcessor

Pure or near-pure module:

```ts
interface RecordingProcessorInput {
  config: ResolvedRecordingConfig;
  events: RecordingEngineLocationEvent[];
  mode: RecordingMode;
  origin: "device" | "simulation" | "reprocessing";
  previousState: RecordingProcessorState;
}

interface RecordingProcessorState {
  auto: AutoModeState;
  lastAcceptedPoint: TripPoint | null;
  session: RecordingSessionSummary;
  segments: TripSegment[];
  points: TripPoint[];
  waypoints: Waypoint[];
}

interface RecordingProcessorOutput {
  state: RecordingProcessorState;
  diagnostics: RecordingDiagnosticEvent[];
  rawProcessingResults: RawLocationEventProcessingResult[];
  transitionRequests: RecordingTransitionRequest[];
}
```

The processor must not:

- call Expo Location
- write SQLite
- write React stores
- show alerts
- mutate globals

### RecordingUnitOfWork

Executor module:

```ts
async function applyRecordingProcessorOutput(
  tripLocalId: string,
  output: RecordingProcessorOutput,
): Promise<RecordingCommitResult>
```

Responsibilities:

- persist trip points
- persist segments
- persist waypoints if segment references changed
- persist session
- update raw event processing status
- refresh trip/segment stats
- emit diagnostics
- update in-memory stores after successful commit

The executor should use one serialized DB write path where possible.

### Native Transition Adapter

Native tracking changes stay outside processor:

```ts
async function applyRecordingTransitionRequests(
  requests: RecordingTransitionRequest[],
): Promise<void>
```

For Android, native restart behavior must be conservative. If restarting FusedLocation causes callback gaps, the adapter can ignore restart requests or defer them.

## Implementation Steps

1. Add processor input/output domain types.
2. Move AUTO batch section logic into `RecordingProcessor`.
3. Move rejected AUTO recovery buffer into processor state or persisted raw state.
4. Convert `raw-event-reprocessing.service.ts` to use the processor.
5. Convert live `RecordingEngine` to use the processor.
6. Add `RecordingUnitOfWork` to persist processor output.
7. Remove direct store writes from `recording-pipeline.service.ts`.
8. Delete or shrink `recording-pipeline.service.ts` to an adapter.

## Testing

Add fixture-based tests:

- same input raw events produce same output in live and replay mode
- Android batched walk-to-bike scenario
- Android batched walk-to-drive scenario
- iOS normal live callback sequence
- duplicate timestamp/raw duplicate handling
- initial 0 km walk bootstrap removal
- segmentless recovery

Use deterministic fixtures, not real clock where possible.

## Acceptance Criteria

- Live path and reprocessing path call the same processor.
- Processor has no direct React/store/native side effects.
- Given identical raw event fixtures, output is deterministic.
- AUTO profile transitions happen before point filtering for each raw event/batch.
- Accepted/rejected/duplicate raw status is derived by processor output.
- Unit tests cover Android batch scenarios that previously failed.

## Risks

- Refactor can temporarily change route output for existing simulation scenarios.
- Processor state shape can become too large if we copy whole trip state.
- SQLite transaction handling in Expo SQLite may need careful batching.

## Migration Strategy

Do not remove old pipeline in one commit.

Use staged migration:

1. Add processor behind tests.
2. Use processor only in raw reprocessing.
3. Use processor for simulation.
4. Use processor for live background callbacks.
5. Delete legacy duplicated logic.
