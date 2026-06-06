# PLAN 56C: Recording And Reprocessing Use-Case Boundary

## Goal

Separate large multi-table recording/reprocessing workflows from low-level storage calls and screen-level orchestration.

The repository layer should provide data access/read models. Use-case services should orchestrate command workflows.

## Current State

After `PLAN_51`, `PLAN_52`, `PLAN_53`, `PLAN_54` and `PLAN_55`:

- recording has a deterministic processor and raw event buffer
- hot-path SQL remains in storage
- repositories exist for persistence boundaries
- route/trips/waypoint read models are starting to exist

But some services still compose multiple persistence modules directly:

- `raw-event-reprocessing.service.ts`
  - loads trips, segments, waypoints, trip points, raw events and session
  - builds preview
  - applies mutation through unit of work
- recording screen/controller still asks several modules for active route/session data
- recording processor is deterministic, but surrounding workflow boundaries are still mixed

## Non-Goals

- Do not change recording filtering/inference behavior.
- Do not change raw-event processing algorithm.
- Do not change sync protocol.
- Do not move hot-path SQL out of storage.
- Do not introduce a framework/DI container.

## Boundary Rule

Use this split:

```text
storage:
  table reads/writes, transactions, SQL/Drizzle implementation

repositories:
  persistence read models and persistence-facing data composition

use-case services:
  command workflows, validation, orchestration, calls to repositories/storage unit-of-work

domain services:
  pure calculations and deterministic processing
```

## Phase 1: Raw Reprocessing Read Model

### Tasks

Create a repository/use-case input model for reprocessing:

```ts
interface RawReprocessingInputModel {
  oldTripPoints: TripPoint[];
  rawEvents: RawLocationEvent[];
  recordingSession: RecordingSessionSummary;
  trip: Trip;
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
}
```

Add a function such as:

```ts
loadRawReprocessingInputModel(tripLocalId: string): Promise<RawReprocessingInputModel | null>
```

This function should own loading all persistence data needed for preview/apply.

### Acceptance Criteria

- `raw-event-reprocessing.service.ts` no longer manually calls each low-level repository/storage loader.
- Existing validation errors remain the same.

## Phase 2: Keep Processor Pure

### Tasks

1. Ensure `recording-processor.service.ts` remains pure/deterministic.
2. Keep it free from storage/repository imports.
3. Keep distance/domain calculations imported only from domain services.

### Acceptance Criteria

- Processor tests do not need storage mocks.
- Reprocessing tests can build deterministic input models.

## Phase 3: Reprocessing Apply Use Case

### Tasks

Separate preview and apply orchestration:

- `buildRawReprocessingPreview(inputModel)`
- `applyRawReprocessingResult(inputModel, processingResult)`

Use the existing `recording-unit-of-work.service.ts` for persistence writes.

### Acceptance Criteria

- Preview can be tested without storage.
- Apply remains transactional through the existing unit-of-work boundary.
- Waypoint segment remapping behavior remains unchanged.

## Phase 4: Recording Screen Active Route Model

### Tasks

Add a small active recording read model:

```ts
interface ActiveRecordingRouteModel {
  activeTrip: Trip | null;
  activeTripPoints: TripPoint[];
  activeTripSegments: TripSegment[];
  lastPointRecordedAt: string | null;
  session: RecordingSessionSummary;
}
```

The recording controller/screen should request this model instead of loading pieces directly.

### Acceptance Criteria

- Recording screen UI behavior remains unchanged.
- Start/pause/resume/stop command functions remain separate from read model loading.

## Phase 5: Tests

### Tasks

Add tests for:

- reprocessing input model missing trip
- active trip cannot be reprocessed
- preview from provided input model
- apply delegates writes to unit of work
- active recording route model for idle/recording states

### Acceptance Criteria

- Raw reprocessing tests no longer need to mock every storage module individually.
- Processor tests remain pure.

## Verification

Run:

```bash
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run lint --workspace mobile
```

Manual checks:

- Preview raw reprocessing on a trip with raw events.
- Apply raw reprocessing and verify route/segments/waypoints.
- Start recording.
- Add waypoint/photo during recording.
- Stop recording.

## Risks

- Reprocessing is data-destructive for route points and segments; keep apply changes small and covered by tests.
- Raw event data can be large; avoid unnecessary repeated full-table loads.
- Active recording UI can become stale if read model refresh timing changes.

## Rollout

Do not migrate recording and reprocessing in one large diff.

Recommended order:

1. raw reprocessing input model
2. preview pure function split
3. apply use-case split
4. active recording route model
5. screen/controller cleanup

