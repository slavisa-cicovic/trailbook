# PLAN 11: Trips Modal Refactor

## Goal

Refactor the current `Trips` screen so that its large modal dialogs are extracted into dedicated components.

The target is not a design rewrite.
The target is clearer code boundaries and easier maintenance.

## Why this matters

`TripsScreen` currently handles several separate UI flows in one file:

- trip edit
- waypoint edit
- trip details
- photo viewer
- trips list and filters

That makes the screen harder to reason about and increases the chance that one modal flow breaks another.

We already saw this with modal transition issues such as `Open trip -> Edit note`.

## Scope

Included in this plan:

- extract major `Trips` modals into separate components
- keep orchestration in `TripsScreen`
- preserve current behavior and state flow

Not included in this plan:

- redesign of card layout
- new navigation patterns
- service-layer changes unless required by prop boundaries

## Target structure

Suggested component split:

- `mobile/src/screens/trips/components/trip-edit-modal.tsx`
- `mobile/src/screens/trips/components/waypoint-edit-modal.tsx`
- `mobile/src/screens/trips/components/trip-details-modal.tsx`
- `mobile/src/screens/trips/components/photo-viewer-modal.tsx`

`TripsScreen` should stay responsible for:

- screen-level filtering and summary
- selected IDs
- modal visibility flags
- action handlers for save/delete/resume
- building the props passed into modal components

## Technical approach

### 1. Extract leaf modal first

Start with the most isolated modal:

- `photo-viewer-modal`

This is a good first cut because it has:

- narrow props
- no nested screen logic
- no impact on list/filter behavior

### 2. Extract simple form modals

Next extract:

- `trip-edit-modal`
- `waypoint-edit-modal`

These are relatively simple because they mostly receive:

- visibility
- current draft values
- change handlers
- save/cancel callbacks

### 3. Extract trip details modal last

`trip-details-modal` should be the last extraction because it is the most coupled one.

It currently combines:

- trip metadata
- route map
- waypoint list
- photo entry points
- note edit entry points

It needs a stable prop contract before extraction.

## Suggested implementation phases

### Phase 1: Photo viewer modal

Extract fullscreen photo viewer first.

Completion signal:

- `TripsScreen` no longer renders the photo viewer JSX inline

### Phase 2: Edit modals

Extract:

- trip edit modal
- waypoint edit modal

Completion signal:

- `TripsScreen` keeps draft state and handlers, but modal JSX is moved out

### Phase 3: Trip details modal

Extract trip details modal once the smaller modals are already separated.

Completion signal:

- `TripsScreen` focuses mostly on list/filter/summary orchestration

## Risks

### 1. Too many props

If the first extraction is too naive, modal components can end up with overly large prop lists.

Mitigation:

- extract in phases
- keep shared data grouped where sensible

### 2. Modal flow regressions

The current `Trips` flow already had timing issues around modal transitions.

Mitigation:

- keep modal visibility/state ownership in `TripsScreen`
- only move rendering and local presentation concerns into child components

### 3. Over-refactor

Breaking out too many tiny pieces too early will create noise.

Mitigation:

- extract only the large modal units for now

## Completion criteria

This plan is complete when:

- the main `TripsScreen` file is materially smaller
- modal JSX is split into dedicated component files
- all current modal flows still work the same
- `TripsScreen` clearly reads as orchestration code rather than one giant render block
