# PLAN 46: Server-Driven Recording Profiles

## Goal

Allow Trailbook mobile recording behavior to be tuned from the backend without requiring a new mobile build for each adjustment.

The primary V1 target is:
- tracking profile configuration for mobile recording

This should make it easier to tune:
- `auto`
- `walk`
- `bike`
- `drive`

especially during real-world testing across:
- iOS
- Android
- test users

## Problem

Right now, recording behavior is tuned in code inside:
- `mobile/src/services/location/location.service.ts`
- and partly in related filtering / auto-mode services

That means:
- every tracking-profile adjustment requires a new app build
- iOS tuning is especially expensive because build/install iteration is slower
- real-world testing produces useful evidence, but applying that evidence is too slow

This is now a product iteration bottleneck.

## Product decision

Move recording profile configuration to a server-driven runtime config model, while keeping the current hardcoded values as a safe fallback.

V1 should:
- fetch a validated config from the backend
- cache it locally on mobile
- use it if available
- fall back to current hardcoded behavior if unavailable or invalid

This keeps:
- offline reliability
- backward compatibility
- safe rollout behavior

## Non-goals

- Do not remove the current hardcoded profile definitions.
- Do not make recording depend on network availability.
- Do not add a user-facing settings screen in V1.
- Do not build a full admin UI in V1.
- Do not move all geo/filter thresholds to the backend in the first slice.
- Do not introduce a remote experiment framework.

## Product principle

Recording must remain safe and predictable even when config delivery fails.

That means:
- server config should improve tunability
- fallback behavior must remain deterministic
- mobile must always be able to record using built-in defaults

## Scope

V1 scope:
- server-driven tracking options only
- role-aware and optionally user-aware overrides
- cached config on mobile
- current hardcoded switch remains the final fallback

Out of scope for V1:
- live editing from the mobile app
- user-custom recording sliders
- server-driven point filter thresholds
- server-driven auto-mode heuristics

## Why this is useful now

Recent testing shows we need to tune:
- iOS `auto`
- Android `auto`
- short bike detection
- car-trip sampling quality

Doing that through new builds is too slow.

A server-driven profile system would let us:
- tune test users faster
- compare different configurations safely
- avoid constant rebuild cycles

## Configuration hierarchy

Recommended precedence:

1. user-specific override
2. role-based override
3. global default server config
4. local hardcoded fallback

This allows:
- targeted testing for specific users
- safe rollout to special roles such as `test_user`
- a stable default for everyone else

## Role strategy

The planned `test_user` role is a strong fit for this system.

Recommended V1 usage:
- ordinary users continue using default server config or fallback
- `test_user` can receive more aggressive or experimental tracking profiles

This avoids exposing unstable tuning to production users too early.

## Data model

V1 should start with a simple JSON-shaped configuration contract.

Suggested shape:

```ts
type TrackingProfileConfig = {
  accuracy: "lowest" | "low" | "balanced" | "high" | "highest" | "bestForNavigation";
  distanceInterval: number;
  timeIntervalMs: number;
};

type PlatformTrackingProfiles = {
  auto?: TrackingProfileConfig;
  walk?: TrackingProfileConfig;
  bike?: TrackingProfileConfig;
  drive?: TrackingProfileConfig;
  boat?: TrackingProfileConfig;
  plane?: TrackingProfileConfig;
};

type MobileRecordingConfig = {
  version: number;
  updatedAt: string;
  profiles: {
    ios?: PlatformTrackingProfiles;
    android?: PlatformTrackingProfiles;
    default?: PlatformTrackingProfiles;
  };
};
```

Notes:
- `default` can be used as a fallback inside the remote payload
- mobile still retains a final hardcoded fallback if no valid remote config exists

## Server design

### Endpoint

Add a lightweight authenticated endpoint, for example:
- `GET /api/mobile/recording-config`

Alternative:
- bundle it into an existing mobile bootstrap/me endpoint later

But V1 is simpler if this stays explicit and small.

### Response behavior

The endpoint should return:
- resolved config for the current user
- already merged according to precedence

That means mobile does not need to know:
- whether the result came from a user override
- a role override
- or a global default

Mobile should only consume the resolved final shape.

### Persistence

V1 can start with one of two approaches:

1. simplest:
- hardcoded or env-backed server-side config object

2. slightly more flexible:
- a database table for resolved override rules

Recommended V1:
- start with server-side code or JSON file-backed config
- only move to DB/admin tooling if iteration pressure continues

This keeps the first slice small and reviewable.

## Mobile design

### 1. New domain model

Add a small shared type for recording config, for example:
- `mobile/src/domain/recording-config.ts`

### 2. Storage

Persist the last valid resolved config locally, for example:
- `mobile/src/storage/recording-config-storage.ts`

Reason:
- preserve offline behavior after one successful fetch
- keep startup robust

### 3. Service

Add a service such as:
- `mobile/src/services/recording/recording-config.service.ts`

Responsibilities:
- fetch remote config
- validate and normalize it
- cache it locally
- expose resolved tracking options for the current platform

### 4. Integration point

Update:
- `mobile/src/services/location/location.service.ts`

So that `getTrackingOptionsForProfile(...)`:
- first tries resolved runtime config
- then falls back to current hardcoded values

This is the key product behavior change.

## Validation rules

The mobile client must validate remote config before using it.

Examples:
- reject negative `distanceInterval`
- reject non-finite `timeIntervalMs`
- reject unsupported accuracy strings
- reject obviously unsafe values

Recommended guardrails:
- minimum and maximum bounds for intervals
- strict enum normalization for accuracy

If validation fails:
- ignore the bad remote value
- fall back to hardcoded defaults

## Offline behavior

Offline behavior is mandatory.

V1 should behave like this:

- if remote config fetch succeeds:
  - cache it
  - use it

- if fetch fails:
  - use last cached valid config if available

- if no cached config exists:
  - use current hardcoded defaults

This preserves the repository’s offline-first rules.

## Refresh strategy

Recommended V1:
- fetch on app bootstrap after auth/session restore
- optionally refresh on login
- no need for constant polling

This is enough for test iteration without adding background refresh complexity.

## Why not user settings yet

User settings are useful later, but not for V1.

Reasons:
- current need is tester/operator tuning, not end-user customization
- user settings create UX questions and support burden
- server-driven test tuning is enough for the immediate problem

## Suggested delivery slices

### Slice 1: shared config model

Add:
- mobile config domain type
- normalization helpers
- server DTO/response type

### Slice 2: mobile local cache + fallback

Add:
- mobile storage for recording config
- service wrapper
- hardcoded fallback preservation

### Slice 3: server endpoint

Add:
- endpoint returning resolved config
- simple hardcoded or env-backed server-side config source

### Slice 4: mobile integration

Update:
- `location.service.ts`

so runtime config is actually used.

### Slice 5: role-based override

Add:
- `test_user` or similar role-aware resolution on server

This can be part of V1 if the role already exists.
Otherwise it can follow immediately after.

## Risks

### Risk: bad remote config harms recording

Mitigation:
- strict mobile validation
- local hardcoded fallback
- bounded numeric ranges

### Risk: mobile/server drift in config schema

Mitigation:
- keep V1 schema small
- version the config payload

### Risk: too much flexibility too early

Mitigation:
- V1 only controls tracking options
- do not remote-control all heuristics yet

### Risk: role override complexity

Mitigation:
- return only final resolved config to mobile
- keep override logic server-side

## Expected outcome

After this plan:
- tracking profile tuning no longer requires a new build for every change
- test users can receive more targeted recording behavior
- mobile remains safe offline
- current hardcoded configuration still works as the final fallback

## Relevant existing code

- `mobile/src/services/location/location.service.ts`
- `mobile/src/services/auth/mobile-auth.service.ts`
- `mobile/src/state/session-store.ts`
- `mobile/src/storage/*`
- `server/src/auth/*`
- `server/src/users/*`
- `server/src/app.module.ts`

