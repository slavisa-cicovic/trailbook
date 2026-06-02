# PLAN 51A: Recording Engine Raw Event Buffer

## Goal

Stabilize Android recording by creating a single recording write path and preserving raw location events before filtering.

This is the first executable slice of `PLAN_51_mobile_architecture_hardening.md`.

The immediate problem this addresses:

- Android can deliver delayed/batched callbacks.
- Current pipeline can reject points before AUTO mode has enough context.
- Current diagnostics do not always tell whether the OS failed to deliver locations or our filter rejected them.
- Accepted point/segment/trip stats can become inconsistent.

This plan does not attempt to refactor every screen or all storage access.

## Scope

Implement:

- `raw_location_events` SQLite table
- raw event repository
- `RecordingEngine` service boundary
- raw-first processing path for background/simulation callbacks
- replay processing for pending raw events
- stats consistency after engine writes accepted points/segments
- diagnostics fields that distinguish raw delivery from accepted route output

Do not implement:

- full sync outbox
- route map matching
- offline maps
- large TripsScreen repository refactor
- photo/media repository refactor
- production privacy/legal work

## Execution Status

Implemented in first slice:

- SQLite migration v9 with `raw_location_events`
- raw event domain type
- raw event storage repository
- `RecordingEngine` boundary
- background task routed through `RecordingEngine`
- GPS simulation routed through `RecordingEngine`
- raw insert before filtering/processing
- raw processing status update after pipeline processing
- active-trip-only stats refresh after accepted raw events
- unit test for raw-first ordering and accepted/duplicate/rejected status mapping

Deferred to 51A.2:

- public replay API for pending raw events
- raw diagnostics counters surfaced in UI/sync
- replacing legacy pipeline internals with engine-owned processing
- larger Android/iOS simulation matrix validation

## Principles

- Raw event is the source of truth for what the app received.
- Accepted trip point is the output of processing/filtering.
- Foreground location must not write recording points.
- Recording writes should go through one service.
- AUTO mode should process raw event context before point filtering.
- Stats should be recomputed from persisted accepted points/segments after processing.

## Data Model

### Mobile SQLite Table

Add `raw_location_events`.

Suggested columns:

- `id TEXT PRIMARY KEY`
- `trip_local_id TEXT NOT NULL`
- `recorded_at TEXT NOT NULL`
- `received_at TEXT NOT NULL`
- `source TEXT NOT NULL`
- `latitude REAL NOT NULL`
- `longitude REAL NOT NULL`
- `accuracy REAL`
- `altitude REAL`
- `speed REAL`
- `processing_status TEXT NOT NULL`
- `processed_at TEXT`
- `decision TEXT`
- `segment_local_id TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Suggested `source` values:

- `background`
- `simulation`

Suggested `processing_status` values:

- `pending`
- `accepted`
- `rejected`
- `duplicate`

Suggested indexes:

- `raw_location_events(trip_local_id, recorded_at)`
- `raw_location_events(trip_local_id, processing_status, recorded_at)`
- `raw_location_events(created_at)`

### Domain Type

```ts
interface RawLocationEvent {
  accuracy: number | null;
  altitude: number | null;
  createdAt: string;
  decision: string | null;
  id: string;
  latitude: number;
  longitude: number;
  processedAt: string | null;
  processingStatus: "pending" | "accepted" | "rejected" | "duplicate";
  receivedAt: string;
  recordedAt: string;
  segmentLocalId: string | null;
  source: "background" | "simulation";
  speed: number | null;
  tripLocalId: string;
  updatedAt: string;
}
```

## RecordingEngine

### Responsibility

Add `mobile/src/services/recording/recording-engine.service.ts`.

Responsibilities:

- receive raw location events for the active recording
- persist raw events before filtering
- process pending raw events in chronological order
- detect Android-style delayed batches
- run AUTO mode inference and segment transitions
- apply point filters using the active/inferred profile
- write accepted trip points
- update raw event processing status
- update recording session state
- update trip and segment stats
- emit diagnostics

### Public API

```ts
interface RecordingEngineInput {
  locations: Location.LocationObject[];
  source: "background" | "simulation";
  restartTrackingOnAutoTransition?: boolean;
}

async function recordLocations(input: RecordingEngineInput): Promise<void>;
async function processPendingRawEvents(tripLocalId: string): Promise<void>;
async function purgeRawEventsForTrip(tripLocalId: string): Promise<void>;
```

`recordLocations` should:

1. load current recording session
2. validate active recording/trip
3. convert locations to raw events
4. insert raw events
5. process pending raw events for that trip

## Processing Flow

### Raw First

Current flow:

```text
callback -> filter/segment -> accepted point
```

Target flow:

```text
callback -> raw_location_events -> RecordingEngine -> accepted trip_points + segments + diagnostics
```

### Chronological Replay

When processing pending raw events:

1. load active recording session
2. load pending raw events ordered by `recorded_at`
3. if event count/lag suggests batch, use batch/offline processing
4. otherwise process live-style in order
5. mark each raw event as accepted/rejected/duplicate
6. update `processed_at`

### AUTO Mode Before Filtering

For AUTO recording:

1. inspect raw event movement profile first
2. update AUTO state / active profile / segment as needed
3. then run point filter using the selected profile

This prevents a bike/drive event from being rejected under the stale `walk` profile before it can trigger transition.

### Duplicate Handling

Android can deliver repeated raw events.

Raw table should allow storing duplicates if received, but processing should identify:

- duplicate `recordedAt`
- duplicate coordinates
- already processed event

Decision should be stored on the raw event.

Open question:

- Should raw event uniqueness be `(trip_local_id, recorded_at, latitude, longitude, source)` or should every callback be stored?

Recommendation:

- Store every callback initially for diagnostics.
- Processing can mark duplicates.
- If storage grows too much, add retention/purge later.

## Stats Consistency

After engine processes accepted points:

1. refresh affected trip segment stats
2. refresh trip stats
3. ensure trip `pointCount` equals accepted visible trip points
4. ensure segment stats sum does not visibly contradict trip stats unless there are intentional hidden points

Use existing stats functions where possible.

If current stats functions have inconsistent behavior, fix them in this plan.

## Diagnostics Changes

Extend diagnostics to distinguish raw and accepted data.

Add or derive:

- raw callback count
- raw background count
- raw simulation count
- first raw recordedAt
- last raw recordedAt
- first accepted recordedAt
- last accepted recordedAt
- pending raw event count
- processed raw event count
- accepted raw event count
- rejected raw event count
- duplicate raw event count

This can be local-only at first if server schema change is too large.

Backend sync can be added later if useful.

## Migration Strategy

### SQLite

Add table creation in current SQLite setup.

No need to migrate old trips.

For old trips:

- `raw_location_events` will be empty.
- Existing trip rendering continues as before.

### Pipeline Migration

Phase migration:

1. Create raw table/repository.
2. Add `RecordingEngine`.
3. Route `persistBackgroundRecordedLocations` through engine.
4. Keep old pipeline internals callable during transition if needed.
5. Remove direct processing from old pipeline after tests pass.

## Tests

Add unit/integration tests for:

- raw events are inserted before filtering
- Android sleep batch `walk -> drive` produces both segments and accepted points
- Android sleep batch `walk -> bike -> pause -> walk` produces correct segments
- duplicate timestamp callbacks are stored raw but not accepted twice
- stats are refreshed after accepted points
- simulation source does not mix with device source
- foreground source cannot write recording points

Use existing simulation scenarios as fixtures.

## Manual Test Matrix

### GPS Simulation

Run on Android and iOS:

- Stationary
- Android sleep: long drive
- Android sleep: walk then drive
- Walk -> Drive -> Walk
- Walk -> Bike -> Pause -> Walk
- Walk -> Drive -> Walk -> Bike

Expected:

- no segmentless accepted points
- no real-device contamination during simulation
- raw count equals generated callback count
- accepted count matches expected filter behavior

### Real Recording

Run on Android and iOS:

- short walk
- bike
- drive
- AUTO walk -> drive -> walk
- AUTO walk -> bike -> walk

Expected:

- if route is bad, raw diagnostics should show whether locations were missing or rejected
- trip stats and segment stats are consistent
- no active segment remains after stop

## Acceptance Criteria

This plan is done when:

- every background/simulation callback is saved as raw event before filtering
- active recording point writes go through `RecordingEngine`
- AUTO batch processing uses raw chronological context
- raw events can explain Android gaps/rejections
- trip and segment stats are consistent after stop/sync
- existing tests pass
- new raw/batch tests pass
- Android `Gerum test`-style problem can be diagnosed from raw events

## Implementation Order

1. Add raw event domain type and SQLite table.
2. Add raw event storage repository.
3. Add `RecordingEngine.recordLocations`.
4. Move current pipeline processing behind engine.
5. Mark raw event processing status/decision.
6. Refresh stats after processing.
7. Extend diagnostics locally.
8. Add tests.
9. Run simulation matrix.
10. Run real Android/iOS recording comparison.

## Follow-Up Plans

Expected follow-ups:

- `PLAN_51A2`: raw event reprocessing for existing local trips
- `PLAN_51B`: repository/view-model layer for TripsScreen and RecordingScreen
- `PLAN_51C`: sync outbox and retry model
- `PLAN_51D`: diagnostics/support bundle
- `PLAN_51E`: media/photo repository hardening
- `PLAN_51F`: map matching/offline maps integration boundaries
