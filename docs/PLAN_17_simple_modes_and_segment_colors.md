# PLAN 17: Simple Modes and Segment Colors

## Goal

Simplify recording modes to three user-facing presets and color route segments on the map so movement type is immediately visible.

## Why

- Early tester feedback suggests battery use is not a meaningful constraint.
- The current profile list is more detailed than users need.
- Users think in movement types such as walking, biking, and driving, not in sampling strategies.
- With trip segments now implemented, the route map should visually show how different parts of the trip were traveled.

## Scope

This plan includes:

- replacing current user-facing recording modes with:
  - `Walk`
  - `Bike`
  - `Drive`
- updating the recording mode selector and labels across the app
- remapping location tracking options to the new simpler presets
- coloring route map polylines by segment mode
- updating trip summaries and segment timeline labels to use the new names

This plan does not include:

- automatic movement detection
- elevation-based styling
- speed heatmaps
- backend migration work

## Target Behavior

- Users choose one of three modes:
  - `Walk`
  - `Bike`
  - `Drive`
- `Change mode` rolls the active trip into a new segment with one of those three modes.
- On the route map:
  - walking segments use one color
  - biking segments use one color
  - driving segments use one color
- Mixed trips are easy to understand at a glance.

## UX Changes

### Recording Screen

- The start modal and change mode modal show only:
  - `Walk`
  - `Bike`
  - `Drive`
- Remove technical or overlapping options such as:
  - `Auto`
  - `Walk / relaxed`
  - `City walk`
  - `Drive / city`
  - `Drive / highway`
  - `Frequent`

### Trips List

- Mixed-mode summary uses the simpler names:
  - `Drive + Walk`
  - `Bike + Walk`

### Route Screen

- Segment timeline uses the simpler labels.
- The map draws one polyline per segment with the mode-specific color.

## Color Direction

Suggested defaults:

- `Walk`:
  - green
- `Bike`:
  - blue
- `Drive`:
  - orange

The colors should be:

- visually distinct
- readable on the light map style
- stable across the app, so the segment list and map feel connected

## Data Model

The segment model from PLAN 16 stays in place.

The main change is the meaning of `RecordingProfile`:

- narrow it to three stable values
- keep implementation details inside location service mapping

## Tracking Strategy

Even with only three user-facing modes, internal tracking options can still differ:

- `Walk`:
  - most detailed updates
- `Bike`:
  - medium detail, tuned for steady motion
- `Drive`:
  - less frequent updates, tuned for longer distances

The user should not see these implementation details.

## Implementation Phases

### Phase 1: Simplify Recording Profiles

- Replace the current recording profile union with:
  - `walk`
  - `bike`
  - `drive`
- Update labels and picker options.
- Update any default profile assumptions.

### Phase 2: Remap Location Options

- Adjust location tracking settings for the new three presets.
- Keep background tracking behavior unchanged in structure.

### Phase 3: Update Segment and Summary Labels

- Update trip list mode summary helper.
- Update route segment timeline labels.
- Remove old profile wording from UI copy.

### Phase 4: Map Segment Coloring

- Group route coordinates by segment.
- Render a polyline per segment with the assigned color.
- Keep waypoint markers unchanged.

### Phase 5: Validation

- Verify trip start, mode change, stop, and resume still work.
- Verify route map shows color changes after mode switches.
- Verify mixed-mode trips remain understandable on both `Trips` and `Route`.

## Validation

- Users can choose only `Walk`, `Bike`, or `Drive`.
- `Change mode` creates a new segment with one of those three modes.
- Route map shows differently colored segments.
- Trip summaries use the simplified labels.
- `npm run typecheck --workspace mobile` passes.
