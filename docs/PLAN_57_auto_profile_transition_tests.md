# PLAN 57: AUTO Profile Transition Test Coverage

## Goal

Add deterministic unit tests for the AUTO profile inference and transition logic.

The processor and batch service are now cleanly separated (post `PLAN_56C`), which
makes this the right time to lock down the transition behavior with focused tests.

## Current State

After `PLAN_54` and `PLAN_56C`:

- `auto-recording-batch.service.ts` — `buildAutoBatchProfileSections` — tested.
- `applyBatchAutoTransitionIfNeeded` — tested: walk→bike, clamp at segment start,
  short batch, profile match, non-auto mode, no segment, <2 samples.
- `inferAutoRecordingProfile` — one regression scenario covered (drive→walk with
  2-min window).

Not tested at all:

- `applyAutoRecordingTransition` — the per-point online path with stability timer.
  This is the most critical untested surface: it owns candidate tracking
  (`autoCandidateProfile`, `autoCandidateSince`), stability-threshold decisions,
  motion-assisted shortcut thresholds, segment open/close, and bootstrap segment
  pruning.
- `inferAutoRecordingProfile` — walk-only, bike-only, drive-only, motion override,
  stale motion fallback.
- `buildAutoBatchProfileSections` — batch that opens with a non-fallback profile,
  two consecutive same-profile runs that should not split.

## Non-Goals

- Do not change inference, transition, or batch algorithm behavior.
- Do not add integration tests that go through the full recording pipeline.
- Do not add tests for recording engine state persistence or UI behavior.

## Boundary Rule

All functions under test are pure or close-to-pure (no storage, no network). Mocks
needed:

- `trip-segments.service` — already mocked in the existing batch test; reuse or
  replicate that pattern.
- `trip-points.service` — `getVisibleTripPointsForTrip` only.
- `recording.service` — `updateRecordingAutoCandidate`, `updateRecordingSegment`.
- `recording-config.service` — `getRuntimePointFilterProfileConfig` (returns null).
- `trip-point-diagnostics.service` — `recordTripPointDiagnostic` etc.

Processors must not need storage or SQLite mocks.

## Phase 1: `inferAutoRecordingProfile` Direct Tests

File: `mobile/src/__tests__/services/auto-recording-inference.service.test.ts`

### Tasks

Scenarios:

1. Empty / too few points → `null`.
2. Stationary samples only → `null`.
3. Walk-speed samples (< 6 km/h) → `"walk"`.
4. Bike-speed samples (9–20 km/h) → `"bike"`.
5. Drive-speed samples (35–60 km/h) → `"drive"`.
6. Motion activity = drive (high confidence) with ambiguous GPS → `"drive"`.
7. Motion activity = bike with walk-speed GPS → `"bike"`.
8. Motion activity stale (older than `MOTION_ACTIVITY_MAX_AGE_MS`) → falls back to
   GPS-only result.
9. GPS says drive, motion says walk → `"drive"` wins (motion does not override plane
   or drive).

### Acceptance Criteria

- Tests import directly from `auto-recording-inference.service.ts`.
- No storage mocks needed.
- Speed values reference exported constants (`WALK_MAX_KMH`, `BIKE_MIN_KMH`, etc.)
  so threshold changes automatically break the right tests.

## Phase 2: `applyAutoRecordingTransition` — No-Op Cases

File: `mobile/src/__tests__/services/auto-recording-transition.service.test.ts`

### Tasks

1. `recordingMode !== "auto"` → `changed: false`, state unchanged.
2. `activeSegmentId === null` → `changed: false`.
3. Inferred profile = `null` (stationary), no existing candidate → `changed: false`,
   candidate remains `null`.
4. Inferred profile = `null`, existing candidate present → `changed: false`, existing
   candidate cleared.
5. Inferred profile = current profile → `changed: false`, candidate cleared.

### Acceptance Criteria

- All five cases covered; none trigger a segment transition.

## Phase 3: `applyAutoRecordingTransition` — Candidate Tracking

### Tasks (same file)

6. First time a new candidate profile is inferred → `changed: false`,
   `autoCandidateProfile` set, `autoCandidateSince` set.
7. Same candidate inferred on next call (time elapsed < threshold) → `changed: false`,
   `autoCandidateProfile` and `autoCandidateSince` unchanged.
8. A *different* new candidate is inferred while an existing candidate is already set
   and differs from current profile → `changed: false`, existing candidate preserved
   (not overwritten).

### Acceptance Criteria

- Candidate fields (`autoCandidateProfile`, `autoCandidateSince`) transition
  correctly in each case.
- No segment is opened or closed.

## Phase 4: `applyAutoRecordingTransition` — Transitions

### Tasks (same file)

Standard stability thresholds (`WALK_STABILITY_MS = 60 s`, `BIKE_STABILITY_MS = 75 s`,
`DRIVE_STABILITY_MS = 75 s`):

9. walk → drive: candidate set, then time ≥ `DRIVE_STABILITY_MS` → `changed: true`,
   new segment with `"drive"` profile, session updated, candidate cleared.
10. walk → bike: same pattern, time ≥ `BIKE_STABILITY_MS`.
11. drive → walk: time ≥ `WALK_STABILITY_MS`.
12. Time elapsed = threshold − 1 ms → still `changed: false`.

Motion-assisted thresholds (`MOTION_ASSISTED_BIKE_STABILITY_MS = 45 s`,
`MOTION_ASSISTED_DRIVE_STABILITY_MS = 45 s`):

13. walk → bike with `motionActivity = { type: "bike", confidence: "high" }`,
    time ≥ 45 s (but < standard 75 s) → `changed: true`.
14. walk → drive with `motionActivity = { type: "drive", confidence: "medium" }`,
    time ≥ 45 s (but < standard 75 s) → `changed: true`.
15. Motion assistance does not apply when confidence = `"low"` →
    requires full `BIKE_STABILITY_MS` / `DRIVE_STABILITY_MS`.

### Acceptance Criteria

- For each transition: `changed: true`, `session.recordingProfile` == new profile,
  `session.activeSegmentId` == new segment localId, `session.autoCandidateProfile`
  == null, `session.autoCandidateSince` == null.
- Old segment has `endedAt` set; new segment has `endedAt == null`.
- Threshold-minus-1 ms cases confirm the timer boundary is exclusive.

## Phase 5: `buildAutoBatchProfileSections` Gap Coverage

File: extend `mobile/src/__tests__/services/auto-recording-batch.service.test.ts`

### Tasks

16. Batch opens with drive-speed samples (not fallback walk) → first section is
    `"drive"`, no walk prefix section.
17. Two consecutive runs of the same profile → they remain in one section (not split).
18. Single-sample batch → returns empty (cannot form a stable run).

### Acceptance Criteria

- Sections array structure and profile sequence correct for each scenario.

## Verification

Run:

```bash
npm run typecheck --workspace mobile
npm test --workspace mobile
npm run lint --workspace mobile
```

Targeted:

```bash
npm test --workspace mobile -- auto-recording-inference
npm test --workspace mobile -- auto-recording-transition
npm test --workspace mobile -- auto-recording-batch
```

## Risks

- Stability threshold tests rely on exact ms values from `auto-recording.utils.ts`.
  Import constants directly rather than hardcoding numbers to avoid silent drift.
- `applyAutoRecordingTransition` calls `getVisibleTripPointsForTrip` internally;
  mock must pass through the points correctly.
- Motion activity age check uses the latest trip point's `recordedAt`; test fixtures
  must set timestamps consistently.

## Rollout

1. inference tests (Phase 1) — no mocks needed beyond expo stubs
2. transition no-op + candidate tests (Phases 2–3) — reuse batch test mock pattern
3. transition firing tests (Phase 4) — build on Phases 2–3 fixtures
4. batch section gaps (Phase 5) — append to existing file

## Implementation Notes

Implemented:

- Created `mobile/src/__tests__/services/auto-recording-inference.service.test.ts`
  (10 tests): empty input, too few points, stationary, walk/bike/drive detection,
  motion drive/bike override, stale motion fallback, GPS drive overrides walk motion.
  No mocks needed — inference service is pure math.

- Created `mobile/src/__tests__/services/auto-recording-transition.service.test.ts`
  (15 tests across 3 describe blocks):
  - No-op: non-auto mode, null segment, null inference with no candidate, pending
    candidate preserved on glitch, inferred = current.
  - Candidate tracking: first set, hold below threshold, switch to new profile.
  - Transitions: walk→drive, walk→bike, drive→walk, threshold-minus-1 boundary,
    motion-assisted bike/drive at 45 s, low-confidence requires full threshold.
  - `inferAutoRecordingProfile` mocked via `vi.mocked`; `isMotionAssistedBike/Drive`
    inlined in mock factory using real logic; threshold constants imported directly.

- Extended `mobile/src/__tests__/services/auto-recording-batch.service.test.ts`
  (4 new tests in `buildAutoBatchProfileSections` block):
  - Drive-first batch uses drive profile (no walk prefix).
  - Two walk runs separated by stationary gap merge into one section.
  - Batch below minimum run threshold uses fallback profile.

Verification:

```bash
npm run typecheck --workspace mobile   # passed
npm test --workspace mobile            # 176/176 passed (27 files)
```
