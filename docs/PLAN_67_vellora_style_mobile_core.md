# PLAN 67: Vellora-style mobile core rearchitecture

## Goal

Rebuild Trailbook mobile internals around the Vellora model while keeping the existing React Native UI usable during migration.

The new architecture treats raw capture data as the source of truth. Segments, distances and trip summaries are derived outputs tagged by a processing version.

## Principles

- Keep UI screens, navigation and visual components.
- Replace current mixed domain/storage concepts behind repository/usecase boundaries.
- Raw samples are primary data. Processed segments are rebuildable.
- Reprocessing is deterministic and uses the same processor as stop/finalize.
- Avoid a big-bang migration. Ship in isolated phases with tests.

## Target Layers

### Domain

- `Trip`: title, description, lifecycle status, sync state, processing version.
- `Segment`: trip id, ordered index, segment type, time bounds, distance.
- `RawLocationSample`: timestamp, lat/lon, accuracy, altitude, speed, bearing, provider.
- `RawActivitySample`: timestamp and activity recognition results.
- `RawDeviceSample`: battery/device state.
- `RawSessionEvent`: service/session lifecycle events.
- `Waypoint` and `WaypointImage` stay attached to trip/segment context.

### Processing

- Pure `TripProcessor.process(bundle)` function.
- `Segmenter` performs:
  - activity-assisted classification,
  - speed fallback,
  - majority smoothing,
  - microsegment merge,
  - boundary stationary/unknown trim,
  - unknown context resolution,
  - stationary redistribution,
  - per-segment distance calculation with accuracy filtering.

### Storage

- New raw capture tables should mirror Vellora:
  - `capture_meta`
  - `raw_location_samples`
  - `raw_activity_samples`
  - `raw_device_samples`
  - `raw_session_events`
  - `segments`
  - simplified `trips`
  - `waypoints`
  - `waypoint_images`
- Existing tables remain during transition.
- Migration/adapters can populate new read models from current data where needed.

### Backend

The backend should move toward the same snapshot-first model as Vellora instead of mirroring every mobile table as relational rows.

Target `trips` shape:

- `id`: server primary key.
- `client_trip_id`: mobile/client trip id, globally unique per synced trip.
- `title`, `description`, `started_at`, `ended_at`, `status`.
- `processing_version`: version used to derive segments from raw samples.
- `raw_bundle`: JSONB payload containing the complete trip bundle.
- `user_id`, `created_at`, `updated_at`.

The bundle should contain:

- raw location/activity/device/session samples,
- derived segments,
- waypoints and waypoint images metadata,
- diagnostics/capture metadata when available.

This model deliberately avoids separate backend `trip_points`, `trip_segments`, `raw_location_events`, stats and diagnostics tables as the primary source. Those can be temporary compatibility/read-model tables during migration, but the canonical backend payload should be the raw bundle.

### Usecases

- `StartTripUseCase`
- `StopTripUseCase`
- `ReprocessTripUseCase`
- `PauseTripUseCase`
- `ResumeTripUseCase`
- `AddWaypointUseCase`
- `SyncTripUseCase`
- `RestoreTripsUseCase`

## Phases

### 67A: Pure domain and processing core

- Add TypeScript Vellora-style models.
- Port activity classifier, distance calculator, segmenter and processor.
- Add deterministic tests.
- No UI/storage behavior changes.

### 67B: Raw capture repository and storage adapter

- Add raw sample storage/repository.
- Write all recording callbacks to raw sample tables.
- Keep current trip point pipeline active until parity is verified.

### 67C: Stop/reprocess via new processor

- Use `TripProcessor.process` for stop and reprocess.
- Store resulting segments in new segment model.
- Keep old route rendering via adapter.

### 67D: Read model adapters for existing UI

- Feed Trips, Route, Waypoint and Photo screens from new repositories.
- Remove dependency on current trip stats and segment stats hot paths.

### 67E: Sync/restore bundle format

- Sync raw samples, capture meta, waypoints/images and derived segments.
- Restore the same bundle and rebuild UI state locally.
- Add a new backend bundle endpoint that upserts one JSONB trip snapshot.
- Keep old sync endpoints temporarily for compatibility while mobile migration is incomplete.

### 67E2: Backend snapshot schema

- Add simplified backend trip snapshot model/table.
- Store mobile trip bundle in `raw_bundle`.
- Expose list/detail endpoints from snapshot data.
- Keep media upload/storage separate: images remain object storage, while bundle stores metadata and storage keys.
- Migrate existing server relational trip data into bundle snapshots where practical.

### 67F: Remove legacy recording domain/storage

- Remove old auto-recording mode transition services, trip point stats tables and redundant diagnostics once the new pipeline is verified.
- Remove legacy backend trip point/segment/stats sync paths after snapshot sync is proven.

## Acceptance Criteria

- Recording stop and raw reprocessing produce identical segment output for the same raw bundle.
- Android batch and iOS continuous callbacks are both represented as raw samples.
- Route distance on Trips list and Route screen comes from the same processed segment source.
- Existing UI remains functional throughout migration.
