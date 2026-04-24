# PLAN xx: Offline Maps For Hikers

## Goal

Evaluate and potentially add offline map support for users who travel into areas with weak or no mobile signal.

This is a placeholder plan.
It should receive a real plan number when implementation starts.

## Context

Some target users, especially hikers and people recording trips in remote areas, want map access even when the device has no data connection.

Typical scenario:

- the user knows in advance where they are going
- the user downloads a map region before departure
- the user later opens that region without network coverage

This is especially relevant for:

- Fruška Gora
- mountain and forest trails
- border areas
- remote rural routes

## Product Value

Offline maps would improve:

- confidence during hiking and navigation
- usability in low-signal terrain
- route review while still on the trail
- waypoint placement and orientation in the field

## Important Clarification

Offline maps solve map visibility.

They do not solve background GPS sampling quality by themselves.

Even with offline maps:

- Android may still provide sparse location callbacks
- trip recording quality remains a separate concern

## Current Stack Constraint

Trailbook currently uses `react-native-maps`.

This stack does not provide a complete high-level offline region feature by itself.

It can render custom local tiles, but tile download, storage, and region lifecycle would need to be managed by Trailbook.

## Candidate Approaches

## Option A: Stay on `react-native-maps` and use local tiles

### Idea

Keep the current map stack and add offline tile support using local XYZ tiles.

Users would download a region ahead of time.
The app would later render those tiles from local device storage.

### Implementation Direction

- define downloadable map regions
- download tiles by bounding box and zoom range
- store tiles in device storage
- render them with `LocalTile`
- in offline mode on Android, likely use `mapType="none"` to prevent base-map downloads

### Pros

- smaller architectural change
- preserves current map UI and behavior
- can be implemented incrementally

### Cons

- tile download and storage logic must be custom-built
- cache eviction and storage limits become our responsibility
- offline behavior may differ across iOS and Android
- Android support may be more brittle

## Option B: Migrate to a map provider with native offline support

### Idea

Move mobile maps to a provider that supports offline regions as a first-class feature.

The strongest candidate is Mapbox.

### Pros

- proper offline region download model
- styles, tiles, and related resources handled by the SDK
- better long-term product fit if offline usage becomes important

### Cons

- higher migration cost
- provider and billing implications
- map rendering stack would change significantly

## Option C: Hybrid approach

### Idea

Keep the current map stack for now, but implement offline maps only for a few predefined hiking regions first.

Examples:

- Fruška Gora
- Tara
- Kopaonik

This reduces scope and gives real user feedback before a larger migration.

## Recommended First Slice

If this work is started, the lowest-risk V1 is:

- predefined downloadable hiking regions
- offline tiles only for mobile
- read-only offline map usage at first
- no arbitrary free-form custom region selection in V1

This would let us test:

- storage cost
- download UX
- real field usefulness
- Android/iOS rendering reliability

## Data And UX Questions

If implemented, the product will need answers for:

- how users discover available offline regions
- whether download happens over Wi-Fi only
- how much storage each region uses
- how users remove expired or unused regions
- whether downloaded regions auto-update
- how map style behaves in offline mode

## Technical Questions

- Where should tile packages be stored on device?
- What tile source and license model should be used?
- What zoom range is sufficient for hiking use?
- How should offline mode be detected and surfaced in UI?
- Should the app fall back automatically to offline tiles or require explicit mode switch?
- How well does `LocalTile` behave on Android devices we care about?

## Non-goals

- Do not redesign trip recording in this plan.
- Do not tie offline maps to route map matching.
- Do not promise turn-by-turn offline navigation in V1.
- Do not support global arbitrary offline coverage in V1.

## Recommendation

If offline maps become a core product requirement, a provider with native offline region support is probably the stronger long-term choice.

If the goal is to validate user demand quickly, start with a small predefined-region prototype using the current map stack.

## Future Implementation Notes

When this plan is implemented:

- choose the map/tile provider explicitly
- define offline storage and cleanup rules
- add download progress and failure handling
- add region metadata and versioning
- test heavily on real Android devices, especially Samsung

