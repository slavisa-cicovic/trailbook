# PLAN 54: Recording Pipeline Observability And Cleanup

## Goal

Make the recording pipeline easier to reason about before changing Android AUTO recording behavior again.

The immediate goal is not to tune thresholds. The immediate goal is to make the pipeline tell us, for every batch/callback and for every reprocess run, what happened at each stage:

```text
native callback/raw event
  -> raw event insert
  -> snapshot ordering/dedup
  -> auto profile inference
  -> segment transition
  -> trip point filter/accept/reject
  -> persistence
  -> stats refresh
```

This should let us answer concrete questions:

- Did Android stop delivering location callbacks?
- Did we receive callbacks but reject them?
- Did AUTO infer the wrong profile?
- Did a transition happen too late?
- Did batch processing and single-point processing produce different decisions?
- Did reprocessing produce a materially better route than live processing?

## Implementation Status

Updated: 2026-06-06

Completed:

- Added a shared `RecordingProcessingTrace` model and helpers for duplicate counts, recorded-at ranges and max gap calculations.
- `recording-pipeline.service.ts` now returns a structured `RecordingPipelineResult` from `processRecordedLocationSnapshots`.
- `persistBackgroundRecordedLocations` remains `Promise<void>` for existing callers.
- `recording-engine.service.ts` emits a compact `recording/processing_trace` diagnostic event after live callback/batch processing.
- Diagnostic trace persistence is fire-and-forget and lazy-loads the diagnostic repository so pure trace helpers do not pull Expo/Drizzle into unit tests.
- `recording-processor.service.ts` now returns the same trace format for raw-event reprocessing.
- `raw-event-reprocessing.service.ts` exposes the trace in reprocessing preview output.
- Added tests for trace helper semantics, live recording trace emission and reprocessing trace output.

Intentionally unchanged:

- AUTO thresholds.
- Recording profile configs.
- Native callback subscription strategy.
- Raw SQL hot-path storage.
- Sync payloads.

## Current State

Important files:

- `recording-engine.service.ts`
  - wraps native callback snapshots into raw events
  - inserts raw events before processing
  - calls `processRecordedLocationSnapshots`
  - computes raw processing results by comparing trip points before/after
  - refreshes stats
- `recording-pipeline.service.ts`
  - owns live processing queue
  - handles batch detection
  - handles AUTO sample buffer
  - handles rejected AUTO recovery buffer
  - performs profile transition and point append
  - writes recording session, trip points, segments and waypoints
- `recording-processor.service.ts`
  - replays raw events into points/segments for reprocessing
  - uses `buildAutoBatchProfileSections`
  - produces high-level replay output
- `auto-recording-inference.service.ts`
  - infers candidate profile from speed window and motion activity
- `auto-recording-transition.service.ts`
  - converts inferred profile into segment transitions
- `raw-location-event-processing.service.ts`
  - maps raw events to accepted/duplicate/rejected processing status

The code works, but diagnosis is weak:

- live processing and reprocessing are related but not represented as the same staged pipeline
- batch processing has a separate branch with different behavior from normal snapshot iteration
- rejected AUTO recovery exists only in live pipeline state
- processing results currently say accepted/rejected, but not enough about why the pipeline made that decision
- Android callback gaps are hard to distinguish from app-side filtering

## Non-Goals

- Do not tune AUTO thresholds in this plan.
- Do not change recording profiles or recording configs.
- Do not replace the current raw SQL hot path.
- Do not change sync payloads.
- Do not rewrite the whole recording engine.
- Do not introduce foreground recording as a parallel write path.

## Design Direction

Introduce explicit recording processing diagnostics first, then use them to guide code cleanup.

Keep the write path:

```text
background/native callback -> raw event insert -> pipeline -> raw status update
```

But make stage outputs explicit and testable.

## Tasks

### 1. Define A Processing Trace Model

Add a domain/service-local type, for example:

```ts
interface RecordingProcessingTrace {
  batchId: string | null;
  callbackSource: "background" | "foreground";
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  inputSnapshotCount: number;
  rawInsertedCount: number;
  sortedSnapshotCount: number;
  duplicateRecordedAtCount: number;
  inferredProfile: RecordingProfile | null;
  previousProfile: RecordingProfile | null;
  activeProfile: RecordingProfile | null;
  transitionChanged: boolean;
  transitionAt: string | null;
  acceptedPointCount: number;
  rejectedPointCount: number;
  recoveredPointCount: number;
  maxRawGapMs: number;
  maxAcceptedGapMs: number;
}
```

This does not need to be the final exact shape, but it must answer the questions above.

### 2. Emit Trace As Diagnostic Events

Persist one compact diagnostic event per processed native callback/batch:

- category: `recording`
- name: `processing_trace`
- severity: `info`
- payload: trace summary

Use existing diagnostic event storage/repository. Keep payload compact; do not store full coordinates in diagnostics because raw events already contain that.

### 3. Return A Structured Pipeline Result

Refactor `processRecordedLocationSnapshots` internals so it can return a structured result, for example:

```ts
interface RecordingPipelineResult {
  acceptedPointCount: number;
  duplicateRecordedAtCount: number;
  processingTrace: RecordingProcessingTrace;
  rejectedPointCount: number;
}
```

`recording-engine.service.ts` should no longer infer all status only from before/after points if the pipeline can report counts directly.

Acceptance for this step:

- public behavior remains the same
- existing tests still pass
- current raw status update still works

### 4. Extract Live Snapshot Processing Stages

Break the large nested function in `recording-pipeline.service.ts` into small pure-ish helpers where practical:

- load active recording state
- detect batch
- build ordered snapshots
- process AUTO batch sections
- process single snapshot
- apply transition
- append/filter point
- persist pending changes

Do not move files aggressively yet. The first refactor can stay inside `recording-pipeline.service.ts` if that keeps the diff safe.

### 5. Align Live Processing And Reprocessing Summaries

`recording-processor.service.ts` already computes:

- duplicate raw event count
- rejected raw event count
- max raw gap
- max accepted gap
- generated segments

Extend or adapt this output to the same trace shape used by live processing.

This lets the reprocess screen show a meaningful before/after:

- raw callback count
- live accepted count
- reprocessed accepted count
- max accepted gap before/after
- segment profile summary before/after

### 6. Add Tests For Trace Semantics

Add focused tests for:

- Android-style batch where raw events arrive late but are processed in recorded order
- AUTO transition captured in trace
- rejected AUTO point counted as rejected, not invisible
- reprocessing trace reports improved accepted count/gap when raw events can recover route

Do not rely on UI tests for this.

### 7. Keep UI Changes Minimal

If needed, expose trace summaries in existing debug/reprocessing screens only.

Do not change the recording screen UX in this plan except for optional debug visibility gated behind existing test-user/debug paths.

## Acceptance Criteria

- Processing trace is emitted for live recording callback/batch processing.
- Reprocessing can produce the same kind of trace summary.
- For a bad Android trip, diagnostics can distinguish:
  - no native callbacks received
  - raw callbacks received but rejected
  - AUTO profile/transition issue
  - point filter issue
- Existing recording tests pass.
- Full mobile checks pass:

```bash
npm run typecheck --workspace mobile
npm run test --workspace mobile
npm run lint --workspace mobile
```

## Risks

- Adding diagnostics to a hot path can add overhead.
- Refactoring `recording-pipeline.service.ts` can change behavior accidentally.
- Too much trace detail can create noisy or large diagnostics.

Mitigation:

- store one compact summary per callback/batch
- avoid full coordinate payloads in diagnostics
- keep refactor small and test each behavior-preserving step
- do not tune thresholds in the same commit as observability changes

## Rollback

Rollback should be simple:

- disable trace emission first if overhead appears
- revert helper extraction if it changes recording behavior
- keep raw event storage intact

## Follow-Up

After this plan, use real Android/iOS trip traces to decide whether the next fix is:

- Android native callback reliability
- AUTO inference thresholds
- transition stability timing
- point filtering for profile changes
- reprocessing strategy for previously bad trips
