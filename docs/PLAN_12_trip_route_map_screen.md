# PLAN 12: Trip Route Map Screen

## Goal

Move the `Open trip` flow away from a details-heavy modal toward a `map-first` experience, so the user can view the full route on the largest possible map viewport and open waypoint details directly from markers.

## Why

- the current `Open trip` modal mixes multiple concerns: summary, map, waypoint list, and photos
- the map loses space in the one place where it should be dominant
- for geographically long routes, it is more important for the user to understand the whole path than to read a list below it
- `Waypoint` objects are spatial events on the route and should be opened from markers rather than primarily from a list

## Target UX

### Trips screen

- `Open` on a trip card no longer opens a heavy details modal
- `Open` navigates to a dedicated `TripRouteScreen`

### Trip route screen

- the screen is `map-first`
- the map takes most of the viewport
- it displays:
  - the route polyline
  - waypoint markers
  - a minimal summary/header
- marker styling distinguishes:
  - `note only`
  - `note + photos`

### Waypoint details

- tapping a marker opens waypoint details
- waypoint details show:
  - title
  - note
  - location
  - photos
- waypoint details can remain a modal in the first iteration
- note editing and photo management stay available through the waypoint details flow

## Scope

### In scope

- a new `TripRouteScreen`
- navigation from `Trips` to the route screen
- a map with route polyline and waypoint markers
- visual differentiation of marker types
- waypoint details opened from markers
- preserving existing edit and photo flows through the new entry point

### Out of scope

- new backend or sync behavior
- marker clustering
- complex map controls
- redesign of the recording screen

## Proposed structure

### New route layer

- `mobile/app/trips/[tripId].tsx`

### New screen

- `mobile/src/screens/trips/trip-route-screen.tsx`

### New components

- `mobile/src/screens/trips/components/trip-route-map.tsx`
- `mobile/src/screens/trips/components/waypoint-details-modal.tsx`
- optional:
  - `mobile/src/screens/trips/components/waypoint-marker.tsx`

## Data and state

- the route screen reads:
  - `Trip`
  - `TripPoint[]`
  - `Waypoint[]`
  - `WaypointAttachment[]`
- the screen computes:
  - map coordinates
  - fitted region
  - marker type:
    - `note`
    - `note_with_photos`
- local UI state:
  - `selectedWaypointId`
  - `waypointDetailsVisible`
  - `photoViewerVisible` or `selectedPhotoAttachmentId`

## Phases

### Phase 1: Route screen bootstrap

- add a new route path for an individual trip
- create `TripRouteScreen`
- move the `Open` action from modal opening to screen navigation
- render the map with polyline

### Phase 2: Marker-based waypoints

- remove the waypoint list from the main route view
- render waypoint markers on the map
- visually distinguish markers for:
  - note only
  - note + photos
- tapping a marker selects the waypoint

### Phase 3: Waypoint details flow

- open waypoint details from a marker
- show note and photos
- connect the existing photo viewer
- preserve note editing and photo removal

### Phase 4: Cleanup

- reduce or remove the old `TripDetailsModal`
- keep only a lightweight trip summary modal if it still proves useful
- clean up `TripsScreen` from old detail-modal orchestration

## Risks

- navigation and edit flows must not lose existing photo/remove/edit functionality
- map region fitting for very long routes must remain readable
- marker tap handling and photo viewer state must not conflict

## Validation

- `Open` from a trip card navigates to the route screen
- the route screen renders the full route and waypoint markers
- markers are visually different when a waypoint has photos
- tapping a marker opens the correct waypoint details
- note editing and photo removal still work
- `npm run typecheck --workspace mobile` passes
