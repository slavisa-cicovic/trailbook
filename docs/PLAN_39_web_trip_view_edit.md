# PLAN 39: Web Trip View / Edit

## Goal

Add a web trip detail page where an authenticated `user` can:
- view the route map
- view trip metadata
- view summary and timeline/segment information
- edit basic trip metadata

This is a `view-first` feature. We are not building a full web trip editor in this phase.

## Why

The web app currently has:
- an admin dashboard
- a user trips overview table

But it does not have a drill-down into a concrete trip. That leaves `/trips` as a blind list without a proper detail page and without a place for basic editing.

## Product scope

V1 should cover:
- route map
- title / description / profile / started / ended / updated
- summary:
  - distance
  - waypoints
  - photos
  - segments
- segment/timeline overview
- basic metadata edit:
  - `title`
  - `description`

V1 should not cover:
- segment mode editing on web
- waypoint editing
- photo upload/delete
- route smoothing
- manual route correction
- share flow

## URL and navigation

Add:
- `/trips/[tripId]`

From the `/trips` list:
- `Title` should link to the detail page

Behavior:
- unauthenticated -> redirect to `/login`
- admin -> redirect to `/dashboard`
- user can only view their own trips

## Data contract

We need two server DTO layers:

1. `GET /api/trips/overview`
- remains for the list page

2. new `GET /api/trips/:tripId`
- returns full owned trip detail for web

Suggested payload:

```ts
{
  trip: {
    id: string;
    title: string;
    description: string;
    recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
    startedAt: string;
    endedAt: string | null;
    updatedAt: string;
    syncStatus: "local-only" | "pending-sync" | "synced";
  };
  summary: {
    distanceMeters: number;
    waypointCount: number;
    photoCount: number;
    segmentCount: number;
  };
  points: Array<{
    latitude: number;
    longitude: number;
    recordedAt: string;
    segmentLocalId: string | null;
  }>;
  segments: Array<{
    localId: string;
    recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
    startedAt: string;
    endedAt: string | null;
    distanceMeters: number;
  }>;
  waypoints: Array<{
    localId: string;
    title: string;
    note: string | null;
    latitude: number;
    longitude: number;
    recordedAt: string;
    photoCount: number;
  }>;
  pauses: Array<{
    startedAt: string;
    endedAt: string | null;
  }>;
}
```

Note:
- for web V1 we do not need the raw attachment list if `photoCount` is enough
- if we later introduce waypoint detail on web, we can extend this payload or add a dedicated endpoint

## Update contract

Add:
- `PATCH /api/trips/:tripId`

For V1, allow editing only:

```ts
{
  title?: string;
  description?: string;
}
```

Server rules:
- only the owner can update
- update changes `updatedAt`
- it does not modify route/segments/waypoints

## UI structure

The `/trips/[tripId]` page should use the same dashboard shell as the rest of the authenticated web area.

Suggested layout:

1. top header block
- `Back to trips`
- trip title
- metadata badges / short info
- `Edit` action

2. map card
- central large map view
- map type tabs are not required in V1
- `standard` map with route polyline and waypoint markers is enough

3. summary cards
- Distance
- Waypoints
- Photos
- Segments

4. trip details card
- profile
- started
- ended
- updated
- description

5. timeline / segments table
- profile
- start
- end
- distance

If pauses exist:
- show them as dedicated timeline rows
- a dedicated visual color treatment is not required in V1

## Map implementation

The web map needs a pragmatic choice.

Best V1:
- Google Maps JS or the existing map provider already present in the web stack, if any

If the web app does not yet have a map library:
- add a single clear library just for trip detail

The V1 map must support:
- fit bounds on route points
- polyline rendering
- waypoint markers

It does not need:
- edit mode
- draggable markers
- route snapping

## Reuse from mobile

We should reuse the logic conceptually, not by copying code directly.

We can reuse:
- summary shape
- timeline/segment presentation
- map region/fallback logic

But web needs its own presentation layer.

## Server implementation slices

### Slice 1: Read endpoint

Add `GET /api/trips/:tripId`:
- owner guard
- joined query for trip, points, segments, waypoints, attachment count, pauses
- server-side summary calculation

### Slice 2: Update endpoint

Add `PATCH /api/trips/:tripId`:
- DTO validation
- owner guard
- update `title` / `description` only

### Slice 3: Tests

Add integration tests for:
- owner can fetch detail
- another user cannot fetch detail
- owner can patch metadata
- another user cannot patch metadata

## Web implementation slices

### Slice 4: Trip detail route

Add:
- `web/src/app/(dashboard)/trips/[tripId]/page.tsx`
- a detail view component
- API client methods:
  - `getTripDetail`
  - `updateTrip`

### Slice 5: Trips list link-out

In `/trips`:
- `Title` becomes a link to `/trips/[tripId]`

### Slice 6: Detail UI

Add:
- map card
- summary cards
- metadata/details card
- timeline/segments table

### Slice 7: Basic edit

Add:
- a small edit dialog or inline form
- only `title` and `description`
- optimistic refresh is not required
- a simple refetch after successful patch is enough

## Risks

1. The web map can introduce more integration work than expected
- therefore V1 must stay limited to polyline + markers

2. Large trip payloads
- for long trips the `points` array can become large
- if that becomes a problem we can later add simplification or point decimation for web view

3. Timeline shape mismatch
- mobile already has pause-aware timeline derivation
- the server payload must be explicit enough so the web does not invent a different timeline semantics

## Acceptance criteria

- a user can open a concrete trip from `/trips`
- the page shows the map and core trip metadata
- the page shows summary and segments/timeline
- the user can update `title` and `description`
- admin does not use this page as the main workflow
- server access control prevents users from viewing trips they do not own

## Relevant existing code

- `web/src/sections/trips/view/trips-list-view.tsx`
- `web/src/lib/auth-api.ts`
- `web/src/layouts/dashboard/trailbook-dashboard-layout.tsx`
- `mobile/src/screens/trips/trip-route-screen.tsx`
- `server/src/trips/trips.controller.ts`
- `server/src/trips/trips.service.ts`
