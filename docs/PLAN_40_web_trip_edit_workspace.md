# PLAN 40: Web Trip Edit Workspace

## Goal

Add a dedicated web trip editing workspace where an authenticated `user` can correct an existing trip without overloading the read-only trip detail page.

This should become the main place for heavier trip corrections on web:
- route cleanup
- segment adjustments
- waypoint editing
- trip metadata editing

## Why

The current `/trips/[tripId]` page is now good for:
- viewing a trip
- understanding the route
- making small metadata edits

It is not a good foundation for real editing because:
- the layout is still optimized for reading, not editing
- the map is presentation-first
- there is no room for persistent editing tools, selection state, or undo/redo

If we try to evolve the current detail page into a full editor, we will end up with a mixed-purpose screen that does neither job well.

## Core product decision

Use two separate web routes:

- `/trips/[tripId]`
  - read-first detail page

- `/trips/[tripId]/edit`
  - edit-first workspace

This keeps the mental model clear:
- `view` for understanding the trip
- `edit` for changing the trip

## Editing scope

V1 editing workspace should support:
- editing `title`
- editing `description`
- changing segment mode
- removing route noise / trimming a bad section
- smoothing route
- editing waypoint metadata:
  - title
  - note
  - category

V1 should not support:
- freehand route drawing
- moving raw trip points one by one
- drag-to-edit polyline geometry
- collaborative editing
- real-time sync while editing
- shared trip editing

## UX model

The edit workspace should behave like a focused desktop tool.

Suggested layout:

1. top toolbar
- `Back to trip`
- trip title
- unsaved changes indicator
- `Save`
- `Discard`

2. main content split layout
- large map on the left
- editing panel on the right

3. optional lower panel or right-panel tabs
- `Segments`
- `Waypoints`
- `Route tools`
- `Details`

This is intentionally different from the detail page.

## Map role in the editor

The map becomes an editing surface, not just a preview.

V1 map requirements:
- show route polyline
- show segment coloring
- show waypoint markers
- allow selection of:
  - a segment
  - a waypoint
  - a route trim range marker pair

V1 map does not need:
- drag-and-drop point editing
- Google Directions snapping
- multi-layer GIS behavior

## Editing model

The web editor should use a draft model:

- load server trip detail
- build local editable draft state
- let the user make multiple changes locally
- save explicitly

This is better than immediate server patching per interaction because:
- segment editing and route cleanup are multi-step operations
- users need room to experiment
- we need clean undo/discard behavior

## Draft state shape

The editor should maintain a local draft like:

```ts
{
  trip: {
    title: string;
    description: string | null;
  };
  segments: DraftSegment[];
  points: DraftPoint[];
  waypoints: DraftWaypoint[];
  pauses: DraftPause[];
  dirty: boolean;
}
```

Important rule:
- the draft must remain canonical within the editor
- map, tables, summary cards, and side panels must all render from the same draft state

## Server contract

The current `PATCH /api/trips/:tripId` is too small for this editor.

We need a dedicated save endpoint for structured trip updates.

Recommended new endpoint:
- `PUT /api/trips/:tripId/edit`

Payload shape:

```ts
{
  trip: {
    title: string;
    description: string | null;
  };
  segments: Array<...>;
  points: Array<...>;
  waypoints: Array<...>;
}
```

Server behavior:
- owner-only access
- validate the structure
- replace canonical trip child collections in one transaction
- update `updatedAt`
- preserve attachment records unless explicitly removed through waypoint delete rules

This should behave similarly to mobile sync semantics, but using server trip identity rather than mobile local trip identity.

## Recommended implementation strategy

Do not invent separate web-only trip mutation rules.

Instead:
- reuse the same semantic rules already proven on mobile where possible:
  - segment merge behavior
  - route smoothing behavior
  - trim/remove bad section behavior
- port the logic into shared server-safe or web-safe helpers as needed

This avoids divergence between mobile and web trip correction behavior.

## Feature slices

### Slice 1: Edit route and navigation

Add:
- `/trips/[tripId]/edit`

Detail page change:
- add `Edit trip` button that navigates to the editor

### Slice 2: Draft loading

Build local editor draft state from `GET /api/trips/:tripId`.

Requirements:
- stable draft initialization
- dirty tracking
- discard/reset to last loaded state

### Slice 3: Workspace shell

Create dedicated editor layout:
- wide map region
- right-side tools panel
- top save/discard bar

### Slice 4: Metadata panel

Support:
- title
- description

This is the smallest editing slice and a good first UI proof.

### Slice 5: Segment editing panel

Support:
- list of segments
- change segment mode
- merge adjacent same-mode segments

This should follow the existing mobile semantics.

### Slice 6: Route tools panel

Support:
- `Smooth route`
- `Trim / remove bad section`

These tools should work on draft points, not on the persisted trip directly.

### Slice 7: Waypoint editing

Support:
- edit title
- edit note
- edit category

Optional in the same slice:
- delete waypoint

### Slice 8: Save endpoint

Add `PUT /api/trips/:tripId/edit`:
- owner guard
- full transactional replace/update
- tests for valid and invalid edit saves

### Slice 9: Save/discard UX

Add:
- `Save`
- `Discard`
- dirty state warning before navigating away

## Data ownership and safety rules

- only the owner can use the edit workspace
- shared trips remain read-only
- saving from web must produce the same canonical trip shape that mobile sync can later consume
- route editing must not silently orphan waypoints or segments

## Relationship to mobile

This web editor becomes the preferred place for heavier trip corrections.

Mobile remains better for:
- recording
- quick review
- small metadata tweaks

Web becomes better for:
- desktop route inspection
- segment correction
- route cleanup
- waypoint editing

That is the correct product split.

## Risks

1. Editing semantics can drift away from mobile
- avoid this by reusing the same route/segment rules wherever possible

2. Full draft save is more complex than metadata patch
- this is expected and should be isolated in a dedicated endpoint

3. Map interaction can expand scope quickly
- V1 must stay selection-based, not full geometry manipulation

4. Undo model can explode in complexity
- V1 should use:
  - local draft state
  - discard all
  - per-tool minimal undo only where already easy

## Acceptance criteria

- user can open `/trips/[tripId]/edit`
- user sees a dedicated edit workspace, clearly separate from view mode
- user can change metadata in a draft
- user can change segment modes in a draft
- user can run route cleanup tools in a draft
- user can save all changes explicitly
- user can discard unsaved changes
- unauthorized users cannot edit another user’s trip

## Relevant existing code

- `web/src/app/(dashboard)/trips/[tripId]/page.tsx`
- `web/src/sections/trips/view/trip-detail-view.tsx`
- `mobile/src/screens/trips/trip-route-screen.tsx`
- `mobile/src/services/trip-segments/trip-segments.service.ts`
- `mobile/src/services/trip-points/trip-points.service.ts`
- `server/src/trips/trips.controller.ts`
- `server/src/trips/trips.service.ts`
