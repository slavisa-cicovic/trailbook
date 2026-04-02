# PLAN 06: Recording Bottom Sheet

## Goal

Refactor the recording screen so that the map remains the primary visual surface, while session details and recent waypoints move into a bottom sheet instead of permanently covering the map.

This plan stays mobile-only.
It does not include backend sync work.

## Why this matters

The current recording screen has the right information, but too much of it is always visible over the map.

That causes two UX problems:

- the map is no longer the dominant surface
- route recording feels like a stacked card screen instead of a map-first experience

The recording screen should behave more like a navigation or route-tracking interface:

- map first
- controls second
- details on demand

## UX direction

Use a bottom sheet, not a side drawer.

Why bottom sheet is a better fit on mobile:

- easier one-handed interaction
- keeps the map readable
- works naturally with vertical screen space
- feels appropriate for “details” and “recent items”

Avoid a left or right drawer for this screen.
That pattern is less natural for map interactions on phones.

## Desired user experience

The recording screen should have:

- full map as the main surface
- top status pills
- central recording control over the map
- a collapsed bottom sheet handle

When the sheet is expanded, it should contain:

- current session details
- `Change mode`
- `Add note`
- recent waypoints

The user should be able to:

- leave the sheet collapsed while navigating the map
- expand it when they need context or actions
- keep recording control visible regardless of sheet state

## Scope

Included in this plan:

- moving current session details into a bottom sheet
- moving recent waypoints into the same bottom sheet
- collapsed and expanded sheet states
- preserving existing recording actions inside the sheet

Not included in this plan:

- third-party sheet library
- gesture-heavy multi-snap-point physics
- waypoint editing
- route polyline rendering

## Technical approach

### 1. Start simple

Do not add a heavy dependency immediately.

First implementation should use:

- absolute positioned bottom panel
- simple collapsed/expanded state
- smooth enough transition if easy to achieve

This keeps the feature aligned with the current project stage.

### 2. Keep the map readable

The bottom sheet should:

- be compact when collapsed
- not hide the main map area by default
- only reveal details when expanded

### 3. Keep recording control independent

The large recording control should remain visually independent from the sheet.

It should not disappear into the sheet.
It is the primary route action and should stay accessible over the map.

### 4. Move secondary actions into the sheet

These belong inside the sheet:

- `Change mode`
- `Add note`
- session metadata
- recent waypoints

This reduces clutter on the map.

## Suggested implementation phases

### Phase 1: Basic bottom sheet shell

Add a local `collapsed / expanded` sheet state on the recording screen.

Collapsed state should show:

- a drag handle or label
- perhaps one short summary row

Expanded state should show:

- current session panel
- recent waypoints panel

### Phase 2: Move actions into the sheet

Place `Change mode` and `Add note` into the expanded sheet content.

### Phase 3: Visual polish

Improve:

- spacing
- transparency
- radius
- shadows
- collapsed summary text

## Risks

### 1. Over-engineering too early

Bringing a complex bottom sheet dependency too early would add weight and maintenance cost.

Mitigation:

- start with a simple in-house sheet

### 2. Control overlap

The sheet and recording control may visually fight for the same space.

Mitigation:

- keep the control centered above the sheet zone
- tune sheet height and control spacing together

### 3. Hidden actions

If the collapsed sheet gives no hint, users may miss note and mode actions.

Mitigation:

- include a clear collapsed label such as `Session details`
- show a compact summary when collapsed

## Completion criteria

This plan is complete when:

- the map is visually dominant again
- current session and recent waypoints are no longer permanently covering the map
- the screen has a collapsed and expanded bottom sheet
- `Change mode` and `Add note` remain easy to access
