# PLAN 60: Recording Config Point Filters Only

## Goal

Simplify recording configuration so it only controls JS point filtering and
segment-processing thresholds.

Native background location tracking is now a single unified AUTO baseline. It no
longer changes per recording profile during a trip and no longer reads runtime
recording config.

The config contract should reflect that:

```text
recording config = point filter config
```

## Problem

`MobileRecordingConfig` still contains legacy native tracking profile fields:

- `profiles`
- `accuracy`
- `distanceInterval`
- `timeIntervalMs`

Those values no longer affect native tracking, but they are still present in:

- mobile domain types
- mobile config validation/sanitization
- settings screens
- backend recording config response
- backend tests

This is misleading because the app appears configurable in a way that has no
runtime effect.

## Current Runtime Decision

Native location tracking is intentionally not server-configurable anymore.

Rules:

- native tracking uses the app-defined AUTO baseline
- AUTO inference creates logical movement segments
- point filters may differ by inferred segment profile and platform
- changing point filters must not restart or reconfigure native background
  location services

## Non-Goals

- Do not reintroduce per-profile native location tracking config.
- Do not remove raw location events.
- Do not change AUTO inference behavior.
- Do not remove historical segment profiles (`walk`, `bike`, `drive`,
  `stationary`, etc.).
- Do not remove settings access for test users.
- Do not break old cached config records already stored on devices.

## Target Config Shape

Mobile and backend should converge on this shape:

```ts
interface MobileRecordingConfig {
  version: number;
  updatedAt: string;
  pointFilters: {
    ios?: PlatformPointFilterProfiles;
    android?: PlatformPointFilterProfiles;
    default?: PlatformPointFilterProfiles;
  };
}
```

Remove from the public current contract:

```ts
profiles
TrackingProfileConfig
RecordingConfigAccuracy
accuracy
distanceInterval
timeIntervalMs
```

## Compatibility Rule

Mobile should continue accepting old cached/server config records during
normalization.

If an old config contains:

```ts
{
  profiles: ...,
  pointFilters: ...
}
```

mobile should ignore `profiles` and normalize the record to the new shape.

If an old config has no `pointFilters`, treat it as invalid unless a safe server
default can be fetched. Do not infer point filters from native tracking
intervals because those are different concepts.

## Mobile Work

### Domain Types

Update:

- `mobile/src/domain/recording-config.ts`

Remove:

- `RecordingConfigAccuracy`
- `TrackingProfileConfig`
- `PlatformTrackingProfiles`
- `profiles` from `MobileRecordingConfig`

Keep:

- `PointFilterProfileConfig`
- `PlatformPointFilterProfiles`
- `RecordingConfigPlatform`
- `CachedMobileRecordingConfig`

### Config Service

Update:

- `mobile/src/services/recording/recording-config.service.ts`

Tasks:

1. Remove tracking-profile sanitization and validation.
2. Keep point-filter sanitization and validation.
3. Add a legacy normalizer that accepts unknown records and extracts
   `pointFilters`.
4. Ensure `getRuntimePointFilterProfileConfig` behavior is unchanged.
5. Ensure local override and server default reset only persist point filters.

### Storage

Update if needed:

- `mobile/src/storage/recording-config-storage.ts`

Tasks:

1. Keep stored JSON format simple.
2. No schema migration required if records are normalized on read.
3. Ensure save writes the new shape.

### Settings UI

Update:

- `mobile/src/screens/settings/recording-config-screen.tsx`
- `mobile/src/screens/settings/recording-config-profile-screen.tsx`

Tasks:

1. Rename/copy text to make it clear this is point-filter tuning.
2. Remove any remaining wording about native tracking.
3. Keep per-platform/per-profile point filter editing.
4. Keep reset-to-server-default behavior.

## Backend Work

Update:

- `server/src/auth/mobile-recording-config.types.ts`
- `server/src/auth/mobile-recording-config.service.ts`
- backend auth tests

Tasks:

1. Remove tracking profile response types.
2. Remove default native tracking profile values.
3. Return only point-filter defaults.
4. Accept legacy persisted overrides if they exist, but normalize them to
   point-filter-only responses.
5. Update tests to assert point filters instead of tracking intervals.

No Prisma schema change is expected unless backend stores recording config in a
typed JSON validator that explicitly requires `profiles`.

## API Contract

Endpoint:

```text
GET /auth/recording-config
```

Expected response after this plan:

```json
{
  "version": 1,
  "updatedAt": "2026-06-12T00:00:00.000Z",
  "pointFilters": {
    "ios": {
      "walk": {
        "maxAccuracyMeters": 50,
        "maxJumpDistanceMeters": 120,
        "maxImpliedSpeedKmh": 12,
        "minMovementMeters": 5
      }
    },
    "android": {},
    "default": {}
  }
}
```

## Test Plan

Mobile:

```bash
npm run typecheck --workspace mobile
npm run lint --workspace mobile
npm run test --workspace mobile
```

Backend:

```bash
npm run test --workspace server
```

If workspace scripts differ, run the equivalent package-local commands.

## Manual Checks

1. Fresh app launch loads recording config without errors.
2. Settings -> Recording config opens only for `test_user`.
3. Editing a point filter saves a local override.
4. Reset to server defaults restores point-filter values.
5. Starting recording does not restart native location tracking due to config
   changes.
6. Existing cached config from the old shape does not crash the app.

## Acceptance Criteria

- No active code path reads native tracking options from recording config.
- Mobile current config type has no `profiles`.
- Backend current config response has no `profiles`.
- Settings UI only exposes point filters.
- Old cached mobile config records are normalized safely.
- Typecheck and tests pass.

## Follow-Up

After this plan, consider a separate cleanup for recording mode semantics:

- new recordings are always AUTO
- historical `recordingMode` fields remain for compatibility
- segment profiles remain as inferred output labels
