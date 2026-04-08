# PLAN 16: Trip Segments

## Goal

Allow a single trip to contain multiple movement segments with different recording modes, so the user can clearly see that one part of a trip was driven and another part was walked.

## Why

- A real trip often contains multiple phases.
- `Change mode` should preserve one trip while showing how the trip was actually traveled.
- A single `trip.recordingProfile` is no longer enough once a trip contains multiple movement patterns.
- The route details screen should show the trip as a timeline of segments, not as one flat mode.

## Scope

This plan includes:

- adding a trip segment domain model
- creating and storing segments during recording
- changing `Change mode` to close the current segment and open a new one
- associating trip points and waypoints with the active segment
- showing segment summaries on the route screen
- showing a compact mixed-mode summary on the trips list

This plan does not include:

- automatic mode detection
- map polyline recoloring by segment in the first pass
- backend sync model changes

## Target Behavior

- A trip starts with one initial segment.
- If the user changes mode while recording, Trailbook:
  - closes the current segment
  - opens a new segment within the same trip
- The trip remains one trip.
- The route screen shows all segments in order.
- A trip with multiple segment modes is visibly different from a single-mode trip.

## Example

Trip: `Belgrade day trip`

- Segment 1:
  - mode: `drive_highway`
  - started at: departure from home
  - ended at: arrival in Belgrade
- Segment 2:
  - mode: `city_walk`
  - started at: entering Kalemegdan
  - ended at: end of walk

The user still sees one trip, but the route details clearly show:

- `Drive`
- `Walk`

## Domain Model

Introduce a new entity, for example:

- `TripSegment`

Suggested fields:

- `localId`
- `tripLocalId`
- `deviceId`
- `userId`
- `recordingProfile`
- `startedAt`
- `endedAt`
- `syncStatus`

Add a segment reference where useful:

- `TripPoint.segmentLocalId`
- `Waypoint.segmentLocalId`

Keep `Trip.recordingProfile` only as a legacy or convenience field if needed for compatibility, but stop treating it as the full truth for a mixed-mode trip.

## Recording Lifecycle

### Trip Start

- Starting a trip creates:
  - one `Trip`
  - one initial `TripSegment`
  - one `RecordingSession`

### Change Mode

- `Change mode` no longer mutates the whole trip mode.
- Instead it:
  - ends the current segment at `now`
  - creates a new segment with the selected mode at `now`
  - updates the recording session to point to the new active segment and mode

### Stop Recording

- Stopping a trip ends:
  - the active segment
  - the trip
  - the recording session

### Resume Interrupted Recording

- Resume should restore:
  - the same active trip
  - the same active segment if it is still open
- If the active segment cannot be safely restored, create a recovery segment rather than losing segment continuity.

## State Changes

Extend recording session state with segment awareness:

- `activeSegmentId`

This lets foreground and background recording know exactly where new points belong.

## Storage

Add segment persistence similar to other local stores:

- segment storage module
- segment state store
- hydration path

Background recording task must also hydrate and write segment-aware data.

## UI Changes

### Recording Screen

- Keep `Change mode` where it is.
- Update copy if needed so the action implies a new trip section, not a global edit.

### Trips List

- For mixed trips, show a compact mode summary, for example:
  - `Drive + Walk`
- For single-mode trips, keep the existing simple label.

### Route Screen

- Add a `Segments` section or timeline.
- Each segment row should show:
  - mode label
  - start time
  - end time
  - distance summary
  - duration summary

### Waypoints

- Keep waypoint UX unchanged.
- Internally attach each waypoint to the active segment.

## Implementation Phases

### Phase 1: Domain and Storage

- Add `TripSegment` type.
- Add segment store and storage.
- Add `segmentLocalId` to trip points and waypoints.

### Phase 2: Recording Engine

- Create initial segment when a trip starts.
- Update background and foreground recording writes to use the active segment.
- Add `activeSegmentId` to recording session.

### Phase 3: Mode Change Behavior

- Replace trip-wide mode update with segment rollover.
- End current segment and create next segment on `Change mode`.

### Phase 4: UI

- Show mixed-mode summaries in trips list.
- Show ordered segment timeline on route screen.

### Phase 5: Validation

- Verify trip start, mode change, stop, resume, and waypoint creation.
- Verify background recording still writes points to the correct segment.

## Validation

- Starting a trip creates an initial segment.
- Changing mode creates a new segment instead of mutating the whole trip.
- Route screen shows segment history in order.
- Mixed-mode trips are visually identifiable on the trips list.
- Waypoints and trip points belong to the correct segment.
- `npm run typecheck --workspace mobile` passes.
