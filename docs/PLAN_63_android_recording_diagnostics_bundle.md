# PLAN 63: Android Recording Diagnostics Bundle

## Goal

Make Android recording failures diagnosable from one support bundle.

When Android route recording loses callbacks, delays a batch, or stops tracking
after the app sleeps, the bundle should answer:

```text
Did native tracking remain started?
Did Android deliver callbacks?
Were callbacks batched?
Were raw events inserted?
Were points accepted/rejected?
Did AUTO profile inference transition?
Did watchdog restart tracking?
Did permissions/battery settings look valid?
```

## Problem

We currently have useful raw data, but it is spread across several stores:

- recording native events
- processing trace diagnostic events
- trip point diagnostics
- raw location event summaries
- Android power-management status
- permissions status
- current recording session

The support bundle includes most of these, but not in an actionable Android
recording timeline. Debugging still requires manually correlating several
sections by timestamp and trip id.

## Non-Goals

- Do not change recording behavior.
- Do not change AUTO inference thresholds.
- Do not change native tracking options.
- Do not change raw event persistence.
- Do not change sync payload shape to backend unless a field is strictly local
  support-bundle-only.
- Do not add server-side analytics in this plan.
- Do not solve the Android callback loss bug directly in this plan.

## Target Output

Add a support-bundle section focused on recent recording sessions/trips:

```ts
androidRecordingDiagnostics: {
  generatedAt: string;
  currentSession: ...;
  recentTrips: AndroidRecordingTripDiagnostics[];
}
```

Each recent trip diagnostic should include:

```ts
interface AndroidRecordingTripDiagnostics {
  tripLocalId: string;
  recordingStartedAt: string | null;
  firstRawRecordedAt: string | null;
  lastRawRecordedAt: string | null;
  rawEventCount: number;
  callbackCount: number;
  nativeBatchCount: number;
  nativeCallbackCount: number;
  maxNativeCallbackGapMs: number;
  maxRawRecordedGapMs: number;
  maxAcceptedPointGapMs: number;
  acceptedPointCount: number;
  rejectedPointCount: number;
  recoveredPointCount: number;
  duplicateRawEventCount: number;
  duplicateRecordedAtCount: number;
  transitionCount: number;
  lastActiveProfile: string | null;
  watchdogTickCount: number;
  watchdogStaleCount: number;
  restartRequestedCount: number;
  restartSucceededCount: number;
  restartFailedCount: number;
  permissionMissingCount: number;
  batteryOptimizationWarningCount: number;
  latestNativeTrackingState: unknown | null;
  suspiciousFindings: string[];
}
```

Exact field names can be adjusted during implementation, but the bundle must be
readable without opening SQLite manually.

## Diagnostic Rules

### Suspicious Findings

Generate simple local findings such as:

- `no-background-callbacks-after-start`
- `large-native-callback-gap`
- `large-raw-recorded-gap`
- `raw-events-without-accepted-points`
- `watchdog-stale-detected`
- `restart-failed`
- `battery-optimization-not-ignored`
- `background-permission-missing`
- `native-tracking-not-started`
- `batch-delivered-after-long-sleep`

These are support hints, not product errors.

### Timeline Correlation

For each trip, correlate by:

- `tripLocalId` where available
- event `recordedAt`
- processing trace `batchId`
- raw event `batchId`

If a record has no trip id, keep it in a small `unassignedEvents` section rather
than dropping it silently.

### Keep Payload Bounded

Support bundle must remain small enough to share by email.

Rules:

- include summaries for last 10-20 trips
- include last 100-200 timeline events at most
- do not include full raw event coordinate lists
- include counts/ranges/gaps instead
- keep existing scrubbing

## Mobile Work

### Recording Diagnostics Summary Service

Create a focused service, for example:

- `mobile/src/services/support/android-recording-diagnostics.service.ts`

Responsibilities:

1. Load recent recording native events.
2. Load recent diagnostic events and filter `category="recording"` /
   `name="processing_trace"`.
3. Load trip diagnostics.
4. Load raw location event trip summaries.
5. Build per-trip summaries.
6. Produce suspicious findings.

Do not put correlation logic directly inside `support-bundle.service.ts`.

### Repository Helpers

Add bounded repository reads if needed:

- `recording-native-events-repository`
- `diagnostic-events-repository`
- `raw-location-events-repository`

Potential helpers:

```ts
loadRecentRecordingNativeEventsByTrip(limit)
loadRecentRecordingProcessingTraces(limit)
```

Keep these read-only and bounded.

### Support Bundle

Update:

- `mobile/src/services/support/support-bundle.service.ts`

Tasks:

1. Add `androidRecordingDiagnostics`.
2. Keep existing `recentRecordingNativeEvents`, `recordingNativeEventSummary`,
   `recentDiagnosticEvents`, and `rawLocationEventTrips` for backward
   compatibility unless bundle size becomes a problem.
3. Ensure scrubber still handles the new section.

### Recording Native Events

Review current native event payloads.

If needed, add small fields to future events:

- `trackingStarted`
- `taskOptions`
- `expectedOptions`
- `optionsMatchExpected`
- `appState`
- `backgroundTrackingProfile`
- `locationCount`
- `dedupedLocationCount`
- `firstRecordedAt`
- `lastRecordedAt`
- `batchId`

Do not add full coordinate arrays.

### Processing Trace

Use existing processing trace fields:

- `inputSnapshotCount`
- `sortedSnapshotCount`
- `rawInsertedCount`
- `acceptedPointCount`
- `rejectedPointCount`
- `recoveredPointCount`
- `duplicateRawEventCount`
- `duplicateRecordedAtCount`
- `maxRawGapMs`
- `maxAcceptedGapMs`
- `transitionChanged`
- `previousProfile`
- `activeProfile`
- `inferredProfile`

Add fields only if a missing answer is concrete.

## Tests

Add unit tests for the summary service:

- native callbacks and batches are counted per trip
- processing traces contribute accepted/rejected/recovered counts
- suspicious finding appears for large native callback gap
- suspicious finding appears when raw events exist but accepted count is zero
- unassigned native events are retained separately

Existing tests should remain unchanged unless type updates require it.

## Manual Validation

1. Start a short recording on Android.
2. Export support bundle from settings.
3. Confirm `androidRecordingDiagnostics.currentSession` is populated.
4. Confirm the active/recent trip has native event counts and processing trace
   summary.
5. Let Android sleep during recording, then reopen app.
6. Export another bundle and confirm batch/gap/watchdog fields show what
   happened.

## Acceptance Criteria

- Support bundle has a single Android recording diagnostics section.
- Bundle explains callback gaps without manual SQL inspection.
- Summary is bounded and safe to share.
- Existing bundle fields remain available.
- `npm run typecheck`, `npm run test`, and `npm run lint` pass, with only known
  unrelated warnings allowed.

## Rollback

This plan only adds observability/read-model code. Rollback by reverting the
commit if bundle size, privacy, or performance becomes a problem.
