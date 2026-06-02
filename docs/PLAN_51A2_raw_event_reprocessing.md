# PLAN 51A.2: Raw Event Reprocessing

## Goal

Allow a previously recorded trip to be rebuilt from `raw_location_events` after we fix recording/AUTO/filtering logic.

This solves a specific workflow:

- a trip was recorded
- raw callbacks exist
- accepted `trip_points` or `trip_segments` are wrong
- we fix the engine logic
- we reprocess that trip without needing to repeat the real-world recording

## Scope

Implement a debug/test-user reprocessing tool.

In scope:

- load raw events for a selected trip
- run a preview reprocessing pass without writing changes
- show old vs rebuilt summary
- apply rebuilt points/segments only after explicit confirmation
- refresh trip and segment stats after apply
- mark modified local entities as `pending-sync`
- preserve trip metadata, waypoints, photos, groups and sharing metadata

Out of scope for first version:

- backend raw event sync
- automatic reprocessing after app upgrade
- map matching / snap-to-road
- reprocessing trips that do not have local raw events
- production user-facing UI

## Execution Status

Implemented:

- `raw-event-reprocessing.service.ts`
- preview API with no writes
- apply API that rebuilds target trip points and segments from local raw events
- deterministic reprocessed segment IDs
- waypoint segment remapping
- raw processing status recalculation on apply
- debug/test-user Settings entry
- raw reprocessing screen with local trip candidates and preview/apply flow
- tests for preview no-write behavior and apply writes

Deferred:

- backend raw event sync
- automatic reprocessing after app upgrade
- dedicated backend replace endpoint for reprocessed trip shape
- richer per-segment diff UI
- production user-facing workflow

## Key Rule

Raw events are input.

Accepted trip points and trip segments are derived output.

Reprocessing must never mutate raw events except optionally updating an audit field such as `last_reprocessed_at` in a later schema version.

## Public API

Add `mobile/src/services/recording/raw-event-reprocessing.service.ts`.

Suggested API:

```ts
interface ReprocessingPreview {
  tripLocalId: string;
  rawEventCount: number;
  oldPointCount: number;
  newPointCount: number;
  oldDistanceMeters: number;
  newDistanceMeters: number;
  oldSegmentCount: number;
  newSegmentCount: number;
  oldSegments: ReprocessedSegmentSummary[];
  newSegments: ReprocessedSegmentSummary[];
  warnings: string[];
}

async function previewRawEventReprocessing(tripLocalId: string): Promise<ReprocessingPreview>;
async function applyRawEventReprocessing(tripLocalId: string): Promise<ReprocessingPreview>;
```

`previewRawEventReprocessing` must not write anything.

`applyRawEventReprocessing` must write in one serialized SQLite write operation where possible.

## Processing Model

Current live engine depends on active recording session state.

Reprocessing needs a synthetic replay state:

- trip metadata from `trips`
- raw events ordered by `recorded_at`, then `batch_index`
- recording mode from trip/config, normally `auto`
- initial concrete profile `walk`
- initial segment started at trip `startedAt`
- same AUTO/batch inference rules as the live engine
- same point filters as the live engine

The output should be:

- rebuilt `trip_points`
- rebuilt `trip_segments`
- rebuilt trip stats
- rebuilt segment stats
- raw event processing status recalculated for this replay run

## Segment IDs

Generated segment IDs should be deterministic enough for debugging.

Recommended format:

```text
reprocessed-segment-{tripLocalId}-{index}
```

This avoids random IDs changing on every preview/apply and makes route comparison easier.

If server sync requires stable client local IDs, apply should reuse the same deterministic IDs for the same raw event sequence.

## Waypoint Handling

Waypoints and photos must not be deleted.

Because segment IDs can change, apply must remap waypoint `segmentLocalId`:

- find the rebuilt segment whose `[startedAt, endedAt]` contains waypoint `createdAt`
- if no segment matches, use the nearest segment by time
- if still impossible, set `segmentLocalId = null`

Waypoint location and attachments remain unchanged.

## Safe Apply Strategy

Apply should:

1. load current trip, points, segments, waypoints and raw events
2. build reprocessed output in memory
3. validate output
4. in one write operation:
   - delete current `trip_points` for trip
   - delete current `trip_segments` for trip
   - insert rebuilt segments
   - insert rebuilt points
   - update waypoint segment refs
   - refresh segment stats
   - refresh trip stats
   - mark trip/segments/points/affected waypoints as `pending-sync`

Do not delete:

- trip row
- pauses
- groups
- shares
- waypoint attachments
- raw events

## Validation Before Apply

Abort apply if:

- trip has no raw events
- trip is currently active/recording
- raw event count is zero
- rebuilt point count is zero while old point count is non-zero, unless user explicitly chooses force mode later
- rebuilt segments overlap invalidly
- rebuilt segment starts after it ends

Warnings, not hard failures:

- new distance differs from old by more than 30%
- new point count differs from old by more than 50%
- raw event recorded range does not cover full trip duration
- there are large raw gaps

## UI Entry Point

First version should be debug/test-user only.

Recommended location:

- Settings
- Debug section
- `Reprocess trip from raw events`

Flow:

1. pick trip from local trips list
2. show preview
3. button `Apply reprocessing`
4. confirmation dialog with old/new distance and point count

No automatic reprocessing.

## Backend Sync

First version can be local-only for validation.

Once stable:

- after apply, trip becomes `pending-sync`
- sync should replace points/segments/stats on backend for that trip
- backend should not recompute stats if mobile sends stats snapshot

Open backend question:

- current sync may append/merge points rather than replace whole trip shape
- if so, add explicit `replaceTripRecordingData` endpoint later

## Diagnostics

Preview should include:

- raw event count
- accepted count after replay
- rejected count after replay
- duplicate count after replay
- first/last raw `recordedAt`
- first/last accepted `recordedAt`
- max raw gap
- max accepted gap

This lets us answer:

- did the OS fail to deliver location?
- did our filter reject it?
- did AUTO assign the wrong profile?

## Tests

Add tests for:

- preview does not write
- apply replaces only target trip points/segments
- apply keeps waypoints/photos
- waypoint segment refs are remapped
- stats match rebuilt accepted points
- no raw events returns a clear error
- active trip cannot be reprocessed
- Android sleep batch scenario can be replayed from raw events

## Acceptance Criteria

This plan is done when:

- a trip with local raw events can be previewed
- old/new point count, distance and segments are shown
- apply rebuilds route data from raw events
- waypoints/photos survive apply
- stats are consistent after apply
- reprocessed trip can be opened on TripRouteScreen
- tests pass

## Implementation Order

1. Add raw event replay helpers that convert `RawLocationEvent` to `CurrentLocationSnapshot`.
2. Extract pure processing from live pipeline so it can run against synthetic replay state.
3. Implement preview service with no writes.
4. Implement apply service with serialized write.
5. Add waypoint segment remapping.
6. Add debug Settings UI.
7. Add tests.
8. Validate with GPS simulation trips.

## Notes

This plan depends on `PLAN_51A` first slice because old trips recorded before `raw_location_events` cannot be reprocessed.

If we want cross-device restore plus reprocessing, raw events must eventually be synced to backend. That is not part of this plan.
