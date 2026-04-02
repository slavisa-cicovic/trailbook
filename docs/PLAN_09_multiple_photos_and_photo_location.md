# PLAN 09: Multiple Photos And Photo Location

## Goal

Extend the current waypoint photo flow so that:

- one waypoint can have multiple photo attachments
- the user can clearly see where those photos were taken

This plan stays mobile-only.
It does not include video.
It does not require full route polyline rendering yet.

## Why this matters

The current photo support proves the basic attachment model, but it is still limited in two important ways:

- only one photo is effectively supported in the create flow
- the UI does not clearly communicate the geographic place where photos were captured

For a route app, location context is part of the value of the photo.

The user should be able to understand:

- these photos belong to this waypoint
- this waypoint happened at this place on the route

## Desired user experience

### 1. Multiple photos per waypoint

While creating or editing a waypoint:

1. the user can add more than one photo
2. each selected or captured photo is shown in a local preview strip or list
3. the user can remove any photo before saving
4. saving the waypoint persists all chosen photo attachments

### 2. Photo location display

When viewing a trip and its waypoints:

- the waypoint should show its location context
- the user should understand that attached photos were taken at that waypoint

The first version can present location in one of these ways:

- text coordinates
- a compact location row with pin icon
- a tiny static map-style preview later if needed

For the next slice, text-plus-pin is enough.

### 3. Photo browsing from trip details

Inside trip details:

- waypoint cards should show all photo thumbnails for that waypoint
- tapping a thumbnail can open a larger preview modal
- the same card should show the waypoint location

## Scope

Included in this plan:

- multiple photo attachments per waypoint
- remove photo before save
- remove photo after save
- waypoint location display in trip details
- compact photo preview list per waypoint

Not included in this plan:

- full route polyline rendering
- map gallery of all photo points
- clustering
- video
- backend sync

## Domain model

The current model is already good enough:

- `Waypoint` stores:
  - `latitude`
  - `longitude`
- `WaypointAttachment` stores:
  - photo file metadata
  - parent `waypointLocalId`

Important interpretation:

- photo location comes from the parent waypoint
- we do not need a separate per-photo latitude/longitude field yet

This is acceptable because:

- photos are attached during the waypoint event
- the waypoint is the semantic place marker

If later we support attaching photos long after the fact, we can revisit this boundary.

## Technical approach

### 1. Change waypoint draft from single photo to photo list

The current waypoint draft should move from:

- one optional photo

to:

- a list of selected photos

That list should support:

- append photo
- remove photo before save
- preserve order as selected

### 2. Create multiple attachments on save

When saving a waypoint:

- create the waypoint once
- create one attachment record per selected photo

### 3. Add preview list in waypoint modal

The create waypoint modal should show:

- thumbnail previews of all selected photos
- remove action on each thumbnail
- `Take photo`
- `Choose photo`

The modal must remain usable and not become visually overloaded.

### 4. Show waypoint location in trip details

Each waypoint card in trip details should show location context such as:

- `Lat/Lng`
- or `Location` with a compact coordinate line

This should visually connect the photos to the place where they were taken.

### 5. Show all waypoint thumbnails

Trip details should render all visible photo attachments for a waypoint, not just one.

The first version can use:

- horizontal thumbnail row
- or stacked thumbnails inside the waypoint card

### 6. Optional larger preview

If easy to implement, tapping a thumbnail can open a simple fullscreen or modal image preview.

This is useful but secondary to multiple-photo support itself.

## Suggested implementation phases

### Phase 1: Multiple-photo draft support

Change waypoint draft and modal UI to support several selected photos.

### Phase 2: Attachment creation and removal

Create multiple attachment records on save and support removing selected photos before save.

### Phase 3: Trip details rendering

Render all waypoint photo thumbnails and add location display to waypoint cards.

### Phase 4: Optional preview polish

Add larger preview modal on thumbnail tap if the base experience is already stable.

## Risks

### 1. Modal overload

Adding too many photo controls can make the waypoint modal heavy.

Mitigation:

- keep controls compact
- use thumbnail strip/list instead of large previews

### 2. Confusing location ownership

Users may assume each photo has its own separate GPS coordinate.

Mitigation:

- present photos as belonging to the waypoint location
- keep the UI language consistent: “taken at this waypoint”

### 3. Too much visual weight in trip details

Showing many photos per waypoint can make trip details very tall.

Mitigation:

- use compact thumbnails
- consider a thumbnail row with tap-to-expand

## Completion criteria

This plan is complete when:

- a waypoint can be saved with multiple photos
- selected photos can be removed before save
- trip details show all saved photo thumbnails for a waypoint
- trip details show the waypoint location clearly enough that the user understands where the photos were taken
