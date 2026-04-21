# PLAN 42: Trip Diagnostics Sync

## Goal

Make location diagnostics available after trip sync so platform-specific recording behavior can be inspected from PostgreSQL, without depending on device logs.

## Problem

`PLAN_41` added useful callback observability, but the diagnostics currently live only in memory and are emitted only through `console.info`.

That means:
- diagnostics are lost when the app process dies
- diagnostics are not available on Linux for iOS testing
- diagnostics cannot be queried from PostgreSQL after trip sync

## Non-goals

- Do not sync the full raw callback stream.
- Do not introduce a large per-point/per-callback diagnostics table.
- Do not build a web UI for diagnostics in this slice.
- Do not make diagnostics a permanent always-on runtime requirement.

## Product decision

Sync a compact per-trip diagnostics summary, plus a small optional recent-event sample.

V1 should prioritize:
- callback counts
- accept/reject counts
- foreground vs background split
- reject reason counters
- max callback / recorded gap metrics

If needed, also persist only the last `N` events, capped to a small number (for example `20`).

Diagnostics must be implemented behind a feature flag so they can be disabled cleanly after test campaigns.

Recommended flags:
- mobile: `EXPO_PUBLIC_ENABLE_TRIP_DIAGNOSTICS`
- server: `ENABLE_TRIP_DIAGNOSTICS`

## Data model

### Mobile local model

Add a local `TripDiagnostics` model keyed by `tripLocalId`.

Recommended fields:
- `tripLocalId`
- `deviceId`
- `platform`
- `recordingMode`
- `callbackCount`
- `decisionCount`
- `accepted`
- `foregroundCallbacks`
- `backgroundCallbacks`
- `foregroundAccepted`
- `backgroundAccepted`
- `foregroundRejected`
- `backgroundRejected`
- `duplicateTimestamp`
- `duplicateCoordinates`
- `sessionDuplicateRecordedAt`
- `rejectedByAccuracy`
- `rejectedByMinMovement`
- `rejectedByJumpDistance`
- `rejectedByImpliedSpeed`
- `maxCallbackGapMs`
- `maxRecordedGapMs`
- `updatedAt`
- optional `recentEvents`

### Server model

Add a new `trip_diagnostics` table with one row per server trip and device.

Recommended uniqueness:
- `(trip_id, device_id)`

This allows future multi-device diagnostics for the same logical trip.

Recommended server fields:
- `id`
- `trip_id`
- `device_id`
- `platform`
- `recording_mode`
- all summary counters listed above
- optional `recent_events_json`
- `created_at`
- `updated_at`

## API changes

Extend the existing mobile trip sync payload:
- `POST /api/trips/sync`

Add optional:
- `diagnostics`

Example shape:

```ts
diagnostics?: {
  platform: "ios" | "android";
  recordingMode: RecordingMode;
  callbackCount: number;
  decisionCount: number;
  accepted: number;
  foregroundCallbacks: number;
  backgroundCallbacks: number;
  foregroundAccepted: number;
  backgroundAccepted: number;
  foregroundRejected: number;
  backgroundRejected: number;
  duplicateTimestamp: number;
  duplicateCoordinates: number;
  sessionDuplicateRecordedAt: number;
  rejectedByAccuracy: number;
  rejectedByMinMovement: number;
  rejectedByJumpDistance: number;
  rejectedByImpliedSpeed: number;
  maxCallbackGapMs: number;
  maxRecordedGapMs: number;
  recentEvents?: Array<...small capped shape...>;
}
```

Server behavior:
- if diagnostics are present, upsert them together with trip sync
- if absent, keep current sync behavior unchanged

## Mobile implementation

### 1. Persist diagnostics locally

Add storage/state for trip diagnostics:
- AsyncStorage-backed, similar to other mobile entities

Update diagnostics service so that:
- it still updates in-memory counters for live logging
- it also persists summary state per trip

This persistence should happen incrementally, not only on flush.

All of this must be guarded by the mobile diagnostics flag:
- if disabled, do not collect callback events
- do not write diagnostics storage
- do not attach diagnostics to trip sync payload

### 2. Expose diagnostics for sync

When `syncTripToServer(...)` is called:
- load diagnostics for the trip
- include them in the payload

### 3. Cleanup strategy

After successful trip sync:
- keep diagnostics locally for now
- mark them as synced or simply leave them as local historical debug data

V1 does not need garbage collection yet.

## Server implementation

### 1. Prisma schema

Add `TripDiagnostics` model and relation from `Trip`.

### 2. DTO

Extend `SyncTripDto` with optional diagnostics object.

### 3. Sync service

In `TripsService.syncTrip(...)`:
- upsert trip as today
- if diagnostics payload exists, upsert `trip_diagnostics`

The diagnostics write should be inside the same transaction as trip sync.

This path should also be guarded by the server diagnostics flag:
- if disabled, ignore diagnostics payload and preserve current trip sync behavior

## Validation and tests

### Server

Add tests proving:
- sync without diagnostics still works
- sync with diagnostics stores one diagnostics row
- repeated sync updates the same diagnostics row

### Mobile

Verify:
- diagnostics survive app restart before sync
- diagnostics payload is attached to trip sync
- typecheck passes

## Expected outcome

After a mobile trip is synced:
- PostgreSQL contains compact diagnostics for that trip
- iOS and Android behavior can be compared without logcat/Xcode access
- we can finally answer whether differences come from:
  - OS callback delivery
  - foreground/background split
  - filter rejection

After test campaigns finish:
- diagnostics can be disabled with flags
- core trip recording and sync continue working unchanged

## Relevant existing code

- `mobile/src/services/trip-points/trip-point-diagnostics.service.ts`
- `mobile/src/services/trips/server-trip-sharing.service.ts`
- `mobile/src/screens/trips/trip-route-screen.tsx`
- `mobile/src/screens/trips/trips-screen.tsx`
- `server/src/trips/dto/sync-trip.dto.ts`
- `server/src/trips/trips.service.ts`
- `server/prisma/schema.prisma`
