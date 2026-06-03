# PLAN 51: Mobile Architecture Hardening

## Goal

Make the mobile app easier to reason about, test, debug and prepare for production release.

This is not a single feature plan. It is a roadmap for reducing architectural risk that has accumulated while building recording, AUTO mode, SQLite persistence, sync, diagnostics, photos, simulation and sharing.

The main direction:

- recording writes must be owned by one engine
- UI should render prepared view-models, not raw storage state
- SQLite should be accessed through repositories/use-cases, not directly from screens
- sync should become an outbox/queue, not scattered one-off operations
- debug/test tooling should be explicit and role-gated
- privacy/release requirements should be treated as product features, not last-minute tasks

## Implementation Status

Updated: 2026-06-03

Completed in this hardening pass:

- Recording writes are routed through the recording engine/background pipeline; foreground location remains UI-only.
- Raw location events are persisted and available for diagnostics/reprocessing/restore.
- Trip stats are first-class snapshots on mobile and backend.
- Manual trip sync now uses a local sync outbox worker.
- Permission handling is centralized in `PermissionManager`; feature services only read capability status.
- Test-user-only tools are gated through centralized feature flags.
- Support email can include a diagnostics/support bundle without auth tokens.
- Route post-processing has a storage/schema boundary through `trip_route_variants`.
- Photo restore downloads waypoint photos for offline viewing through a media repository boundary.
- Release-readiness requirements are captured in `docs/RELEASE_READINESS.md`.

Still intentionally deferred:

- Native Android foreground-service watchdog for real OS sleep gaps.
- Full migration of every sync mutation to outbox operations.
- Full screen-by-screen view-model replacement.
- Actual Valhalla/GraphHopper map matching implementation.
- Offline map cache implementation.
- SQLite encryption decision and migration.

## Current Pain Points

### Recording Pipeline Complexity

Recording currently combines too many responsibilities:

- background location callback handling
- AUTO mode inference
- profile transition
- point filtering
- segment creation/closing
- rejected point recovery
- diagnostics
- persistence
- simulation injection

This makes race conditions hard to isolate, especially on Android where callbacks can be batched.

### UI Knows Too Much

Several screens still derive data directly from large in-memory lists:

- trips
- trip points
- segments
- waypoints
- attachments
- groups

This makes Android performance fragile when local data grows.

### Storage Boundaries Are Weak

SQLite is useful, but app code still treats data as global arrays in many places.

The app needs repository APIs that answer product-level questions:

- get trip list summary
- get trip route detail
- get active recording state
- get waypoint photo viewer model
- get group summary

Screens should not compose those from raw tables.

### Sync Is Too Direct

Sync exists, but it is still mostly action-driven:

- sync this trip
- restore all trips
- send stats
- upload attachment
- sync groups

This will become brittle when offline use grows.

### Debug Tools Are Mixed With Product UI

Debug actions are useful, but must stay behind role/feature flags:

- GPS simulation
- database export
- delete local trips
- diagnostics
- recording config editing
- stats backfill/send

### Release Readiness Is Incomplete

Before App Store / Google Play release the app still needs:

- privacy policy
- open-source licenses
- permission explanations
- local data retention policy
- optional SQLite encryption decision
- production build metadata and support bundle

## Non-Goals

- Do not rewrite the app in one large PR.
- Do not replace Expo/RN stack as part of this plan.
- Do not remove SQLite.
- Do not remove AUTO mode.
- Do not implement Valhalla/map matching or offline maps inside this plan; only define integration boundaries.

## Target Architecture

### Layer Overview

Suggested layers:

1. UI screens/components
2. View-model hooks / screen use-cases
3. Domain services
4. Repositories
5. SQLite / SecureStore / filesystem / backend clients
6. Native integrations

Screens should mostly call hooks/use-cases and render state.

Domain services should not depend on React components.

Repositories should hide table layout and migration details.

## Phase 1: Recording Engine Boundary

### Goal

Create a single owner for all recording writes.

### Proposed Component

Add `RecordingEngine`.

Responsibilities:

- accept raw location events
- accept motion activity snapshots
- detect batch/offline windows
- run AUTO mode state machine
- filter points using current/inferred profile
- create/close/merge/prune segments
- write points/segments/session atomically
- emit diagnostics
- expose active recording state to UI

### Input Contract

```ts
interface RecordingEngineLocationEvent {
  accuracy: number | null;
  altitude: number | null;
  latitude: number;
  longitude: number;
  receivedAt: string;
  recordedAt: string;
  source: "background" | "simulation";
  speed: number | null;
}
```

Foreground watcher must not write recording points.

Foreground can still:

- show current user location
- update UI position
- request current fix when needed

### AUTO Mode State Machine

Extract AUTO logic into explicit state:

```ts
interface AutoModeState {
  activeProfile: RecordingProfile;
  candidateProfile: RecordingProfile | null;
  candidateSince: string | null;
  lastMotionActivity: MotionActivity | null;
}
```

Batch handling should be a first-class API:

```ts
processBatch(events: RecordingEngineLocationEvent[]): RecordingEngineResult
processLiveEvent(event: RecordingEngineLocationEvent): RecordingEngineResult
```

### Raw Recovery Buffer

Add short-lived local raw buffer:

- keep last 10-30 minutes of raw location events for the active trip
- used for AUTO transition recovery
- used for diagnostics/support bundle
- can be purged when trip is stopped/synced

This can start as SQLite table:

- `raw_location_events`
- `trip_local_id`
- `recorded_at`
- `received_at`
- `source`
- `lat/lon/accuracy/speed`
- `processed_status`

### Acceptance Criteria

- Only `RecordingEngine` writes trip points for active recording.
- No foreground writer path exists.
- Batch and live paths use same segment/filter primitives.
- Android simulation and real recording tests still pass.
- Existing diagnostics remain available.

## Phase 2: Repository And View-Model Layer

### Goal

Stop screens from deriving large data from global arrays.

### Repositories

Introduce repositories such as:

- `TripRepository`
- `TripRouteRepository`
- `RecordingRepository`
- `WaypointRepository`
- `AttachmentRepository`
- `TripGroupRepository`
- `DiagnosticsRepository`

Example APIs:

```ts
listTripSummaries(params): Promise<TripSummary[]>
getTripRouteDetail(tripLocalId): Promise<TripRouteDetail>
getActiveRecordingSnapshot(): Promise<ActiveRecordingSnapshot>
listTripGroups(): Promise<TripGroupSummary[]>
```

### View Models

Add view-model hooks:

- `useTripsScreenModel`
- `useTripRouteModel`
- `useRecordingScreenModel`
- `useWaypointPhotoViewerModel`
- `useSettingsModel`

### Trips Screen

Trip list should not need all points.

Use stored stats:

- `distanceMeters`
- `durationMs`
- `pointCount`
- `statsUpdatedAt`

Load route points only when opening `TripRouteScreen`.

### Acceptance Criteria

- `RecordingScreen` no longer subscribes to all trips/points unless required.
- `TripsScreen` renders from trip summaries.
- Opening a long trip does not block initial navigation.
- Android performance remains acceptable with hundreds of trips.

## Phase 3: Sync Outbox

### Goal

Make sync reliable, resumable and offline-friendly.

### Outbox Table

Add `sync_outbox`:

- `id`
- `entity_type`
- `entity_local_id`
- `operation`
- `payload_json`
- `status`
- `attempt_count`
- `last_error`
- `created_at`
- `updated_at`

Operations:

- trip sync
- segment stats sync
- group sync
- attachment upload
- trip delete
- group delete

### Sync Worker

Create `SyncWorker`:

- drains pending outbox items
- retries transient errors
- refreshes auth if needed
- preserves order where needed
- exposes sync state to UI

### User Actions

UI actions should enqueue work, not perform all sync directly.

Example:

- user taps sync badge
- app creates/updates outbox item
- worker handles upload
- UI observes status

### Acceptance Criteria

- Failed sync survives app restart.
- Attachment upload retries without duplicating attachments.
- Trip/group sync can run in background-like app sessions when user returns.
- Manual sync button still works by forcing worker drain.

## Phase 4: Stats Snapshot Consistency

### Goal

Keep trip/segment stats as first-class snapshots on both mobile and backend.

### Rules

- Mobile calculates stats when recording changes local data.
- Mobile sends stats during sync.
- Backend stores stats as received.
- Backend returns stats during restore.
- Backend does not recalculate unless running explicit admin/repair function.

### Cleanup

Avoid separate stats tables unless versioned stats history becomes necessary.

Keep stats columns on:

- `Trip`
- `TripSegment`

### Acceptance Criteria

- Restore does not need to load all points to show trip list.
- Group summaries use stored stats.
- Segment timeline uses stored segment stats.
- Existing trips without stats can be repaired with one temporary test-user action.

## Phase 5: Permissions And Runtime Capability Model

### Goal

Keep all permission handling in one place.

### PermissionManager Contract

`PermissionManager` should be the only service that:

- requests location permission
- requests background location permission
- requests camera permission
- requests photo permission if needed
- requests activity recognition permission
- reads current permission status
- explains missing permissions

### UI Integration

After login:

- run permission setup if required
- block recording if required permissions are missing
- show one clear “Set up permissions” action

No other feature should request permissions directly.

### Expo Go Exception

Handle Expo Go as a capability mode:

- no native background recording
- simulation allowed
- permissions that Expo Go cannot support should not block unrelated test flows

### Acceptance Criteria

- No permission request calls outside `PermissionManager`.
- Recording button state follows centralized capability status.
- Camera action never silently does nothing.

## Phase 6: Diagnostics, Support And Test Tooling

### Goal

Make debugging field problems predictable.

### Test-User Tools

Keep behind `test_user`:

- GPS simulation
- recording config editor
- trip diagnostics
- export database
- delete local trips
- send stats backfill
- support bundle export

### Support Bundle

Bundle should include:

- app version/build/runtime/platform
- user role/email
- device id
- permission status
- active recording session summary
- recent diagnostics
- sync outbox summary
- last N raw location events for active trip
- no auth tokens

### Acceptance Criteria

- Support email can attach or include bundle summary.
- Debug screens are invisible to normal users.
- Diagnostics can explain callback count, gaps, accepted/rejected decisions.

## Phase 7: Map And Route Post-Processing Boundaries

### Goal

Prepare clean integration points for route improvement without coupling it to recording.

### Map Matching

Valhalla/GraphHopper should be post-processing:

- raw recorded path stays unchanged
- matched path is stored separately
- UI can toggle raw/matched path
- matching service should know profile/segment

Suggested table:

- `trip_route_variants`
- `variant_type`: raw, matched
- `provider`: valhalla, graphhopper, manual
- `geometry`
- `created_at`

### Offline Maps

Offline map cache should not be mixed with trip data.

Separate concepts:

- map region download
- tile storage/cache metadata
- trip recording
- waypoint photos

### Acceptance Criteria

- Recording does not depend on map matching.
- Map matching failures do not corrupt original route.
- Offline map cache can be deleted independently from trips.

## Phase 8: Photo Storage And Offline Media

### Goal

Make waypoint photos reliable across app upgrades and offline restore.

### Rules

- App owns local copied file, not picker/camera temporary URI.
- Restore from server downloads photo files for offline viewing.
- Attachment records should track:
  - local URI
  - server ID
  - content hash if practical
  - download/upload status

### Cleanup

Add media repository:

- copy/import photo
- remove photo
- download attachment
- cleanup orphan files
- repair missing local files from server

### Acceptance Criteria

- Photos survive app upgrade.
- Restore from server supports offline photo viewing.
- Deleting local trips can optionally keep or remove media files explicitly.

## Phase 9: Role And Feature Flag Model

### Goal

Make user capabilities explicit.

### Roles

Current roles:

- `user`
- `test_user`
- `admin`

Previously discussed but not fully active:

- `web_user`

### Feature Flags

Use centralized resolver:

- recording config editor
- diagnostics
- simulation
- debug storage tools
- support bundle
- admin-only tools

### Refresh Strategy

Settings screen should refresh user role from backend when opened.

For real-time role changes, backend push is not needed now.

### Acceptance Criteria

- No screen manually checks role except through feature flag hook.
- Role change on backend is visible after opening Settings.

## Phase 10: Release Readiness

### Goal

Prepare Trailbook for App Store / Google Play.

### Required Items

- privacy policy
- terms/contact/support email
- open-source license list
- permission rationale copy
- production app icon/splash verification
- production API URL
- crash reporting decision
- analytics decision, if any
- SQLite encryption decision
- data deletion/account deletion policy

### Security And Privacy

Before production:

- remove all dev credentials
- ensure `.env.example` is safe
- ensure no tokens in support bundle
- consider SQLite encryption for private route/photo metadata
- document what is synced and what stays local

### Acceptance Criteria

- Store review can understand background location usage.
- User can contact support from About.
- User can understand permissions.
- Local private data strategy is documented.

## Suggested Execution Order

1. Recording Engine boundary.
2. Repository/view-model layer for RecordingScreen and TripsScreen.
3. Sync outbox.
4. Stats snapshot cleanup/backfill.
5. PermissionManager hardening.
6. Diagnostics/support bundle.
7. Photo/media repository.
8. Route post-processing boundary.
9. Offline maps.
10. Release readiness items.

## Risk Management

Do not refactor all screens at once.

Use this rule:

- first add a new repository/use-case API
- migrate one screen or service to it
- keep tests green
- remove old direct access only after caller migration

Recording changes should always be tested with:

- GPS simulation transition scenarios
- GPS simulation Android sleep scenarios
- real Android bike/drive test
- real iOS bike/drive test

## Testing Strategy

Add tests around:

- AUTO state machine
- batch/offline processing
- raw recovery buffer
- segment transition edge cases
- stats snapshots
- sync outbox retry/idempotency
- repository queries
- permission capability resolution

Keep simulation scenarios as regression fixtures.

## Done Criteria For This Plan

This roadmap is complete when:

- recording writes are centralized
- UI screens no longer require full raw data lists for normal rendering
- sync is queued/retryable
- stats are snapshots on both mobile/backend
- permissions are centralized
- debug tools are role-gated
- photos and route variants have clear storage ownership
- release/legal/support basics are present
