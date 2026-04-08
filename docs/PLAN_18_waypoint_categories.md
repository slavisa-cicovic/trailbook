# PLAN 18: Waypoint Categories

## Goal

Add predefined waypoint categories with icons and colors so users can mark common travel and walking stops faster and understand route context more easily.

## Why

- Users often want to quickly mark a type of place, not type everything from scratch.
- A waypoint category is easier to scan on the map than a plain generic marker.
- Common trip patterns repeat:
  - departure
  - fuel stop
  - border
  - port or ferry
  - restaurant
  - cafe
  - viewpoint
  - monument
  - beach
- The route screen becomes more useful when waypoint meaning is visible at a glance.

## Scope

This plan includes:

- adding a waypoint category field to the waypoint model
- defining a fixed set of system waypoint categories
- assigning each category:
  - label
  - icon
  - color
- updating waypoint creation UI to choose a category
- showing category icons on route map markers
- showing category icons in waypoint lists/cards

This plan does not include:

- free-form user-uploaded icons
- remote icon packs
- backend sync changes

## Product Direction

### Version 1

Only system categories are supported.

This keeps:

- UX simple
- iconography consistent
- map readability under control

### Future-ready model

The data model should not block future custom categories.

That means:

- category identifiers should be stable
- UI should treat category display as metadata lookup
- a future settings screen could add custom categories using:
  - user-entered label
  - chosen color
  - chosen icon from a fixed internal icon set

Version 1 does not implement custom categories.

## Initial Category Set

Suggested first batch:

- `departure`
  - label: `Departure`
- `fuel`
  - label: `Fuel`
- `border`
  - label: `Border`
- `port`
  - label: `Port`
- `ferry`
  - label: `Ferry`
- `restaurant`
  - label: `Restaurant`
- `cafe`
  - label: `Cafe`
- `viewpoint`
  - label: `Viewpoint`
- `monument`
  - label: `Monument`
- `beach`
  - label: `Beach`
- `generic`
  - label: `Note`

If needed, `generic` can be the default fallback.

## UX Behavior

### Add Waypoint

- User chooses a category.
- User can still edit:
  - title
  - note
  - photos
- Optionally prefill the title from category label in the first pass.

### Route Screen

- Waypoint markers use category-specific icon and/or color.
- Waypoint list/cards show the same category treatment.

### Trips and Route Details

- Category metadata should stay visually lightweight.
- The icon should help recognition without overpowering title and note content.

## Data Model

Add a new field on `Waypoint`:

- `category`

Suggested type:

- `WaypointCategory`

The display layer resolves:

- label
- icon
- color

from a category definition table.

## Technical Direction

### Constants

Add a waypoint category catalog file, for example:

- `mobile/src/constants/waypoint-categories.ts`

Each category entry should include:

- `value`
- `label`
- `iconName`
- `color`

### Domain

Extend the waypoint type with category support.

### Storage

Normalize older waypoints to:

- `generic`

if no category exists yet.

### UI

Update the waypoint modal:

- add a category picker
- keep title, note, and photo flow

### Map

Update waypoint markers to use category metadata.

## Future Custom Categories

Not part of version 1, but the model should allow later support for:

- user-defined label
- user-picked color
- user-picked icon from a fixed internal icon set

Version 1 should not support:

- arbitrary uploaded icons
- external image assets

## Implementation Phases

### Phase 1: Domain and Constants

- Add `WaypointCategory`
- Add system category catalog
- Add storage normalization fallback to `generic`

### Phase 2: Waypoint Creation Flow

- Add category selection in waypoint modal
- Keep title and note editing intact

### Phase 3: Display

- Render category icon and color in route waypoint list/cards
- Render category-aware map markers

### Phase 4: Validation

- Verify old waypoints still render as `generic`
- Verify category selection persists
- Verify markers and list items match selected category

## Validation

- Waypoints can be created with a predefined category.
- Existing waypoints without category fall back to `generic`.
- Route map markers reflect waypoint category.
- Waypoint list/cards reflect waypoint category.
- `npm run typecheck --workspace mobile` passes.
