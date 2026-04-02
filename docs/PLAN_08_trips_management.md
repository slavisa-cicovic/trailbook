# PLAN 08: Trips Management

## Goal

Upgrade the `Trips` screen from a passive local list into a usable trip management surface.

The user should be able to:

- delete a trip with a short undo window
- edit trip metadata
- edit waypoint notes for that trip
- remove waypoint photos
- see photo counts on trip cards
- open trip photos from the trip card flow
- see trip cards with clearer visual hierarchy and denser metadata layout

This plan stays mobile-only.
It does not include backend sync work.

## Why this matters

Right now the trip list is mostly a debug-style summary.

That is not enough for real use because the user needs basic lifecycle control over recorded content:

- cleanup accidental trips
- rename a trip later
- fix notes
- remove unwanted photos
- quickly understand whether a trip has media

The trip list should become the main local content management screen.

It should also stop looking like a raw inspection panel.

Trip cards need stronger information hierarchy:

- trip title and description as primary content
- metadata grouped separately
- technical details presented compactly instead of as a long vertical text stack

## Desired user experience

### 1. Delete trip with undo

When the user deletes a trip:

1. the trip disappears from the list immediately
2. a short-lived undo affordance appears, similar to Gmail-style undo
3. if the user taps `Undo`, the trip comes back
4. if the undo window expires, the trip stays deleted locally

For the first version:

- soft delete is preferred
- use `deletedAt` rather than hard removal

This matches the existing domain better and keeps future sync safer.

### 2. Edit trip

The user should be able to edit:

- trip title
- trip description

The first version can use a modal from the trip card.

### 3. Edit waypoint notes

Within a trip details flow, the user should be able to:

- see the trip waypoints
- edit waypoint title
- edit waypoint note

### 4. Remove photos

For waypoints that have photos:

- show the photo
- allow removing it

First version can support removal only, not replacement or reordering.

### 5. See photo count on trip card

Each trip card should show a compact summary like:

- number of waypoints
- number of photos

This helps the user scan the list quickly.

### 6. View photos from a trip

When the user taps the photo summary or a dedicated action:

- open a trip details modal or screen
- show trip photos through waypoint cards or a compact gallery

The first version does not need a complex lightbox.

### 7. Improve trip card design

Trip cards should be visually restructured.

Recommended direction:

- `title` and `description` remain the main content
- metadata should move into a two-column key/value grid
- actions should be grouped separately from the content

Suggested trip card structure:

- header
  - trip title
  - optional state badge such as `active`, `local`, or sync state
- body
  - description
- meta grid
  - `Mode`
  - `Waypoints`
  - `Photos`
  - `Started`
  - `Ended`
  - `Sync`
- footer actions
  - `Open`
  - `Edit`
  - `Delete`

This should make cards denser, clearer, and less visually flat.

## Scope

Included in this plan:

- delete with undo
- trip edit modal
- trip details flow
- waypoint note edit
- waypoint photo removal
- photo count on trip card
- redesigned trip cards with grouped metadata

Not included in this plan:

- backend sync conflict resolution
- multi-select bulk actions
- waypoint reordering
- advanced gallery viewer
- video management

## Technical approach

### 1. Prefer soft delete

Trips, waypoints, and attachments already have `deletedAt`.

Use that instead of hard removal for the first version.

Benefits:

- future sync is cleaner
- undo is easier
- accidental deletion is safer

### 2. Add trip selectors

The `Trips` screen should not manually derive everything inline.

Add selectors/helpers for:

- active visible trips
- waypoints by trip
- photo attachments by trip
- photo count by trip

This will keep the screen readable as functionality grows.

### 2a. Add presentation-ready trip summaries

The screen should not assemble card presentation details ad hoc.

Add a small presentation mapping layer that can provide:

- waypoint count
- photo count
- display status badge
- key/value pairs for the metadata grid

This will make the card redesign easier to maintain.

### 3. Add trip management service

Add a dedicated service for trip management operations such as:

- mark trip deleted
- restore trip
- update trip metadata
- update waypoint metadata
- mark attachment deleted

This logic should stay out of the screen component.

### 4. Undo flow

The first version can use a simple local pending-delete state:

- remove from visible list immediately
- show undo banner/snackbar
- if undone, restore before timeout
- if timeout expires, keep soft-deleted state

This does not require a full notification framework.

### 5. Trip details surface

Add a trip details modal or screen that shows:

- title
- description
- started/ended
- photo count
- waypoint list

Each waypoint row can show:

- title
- note
- photo thumbnail if present
- edit action
- remove photo action

## Suggested implementation phases

### Phase 1: Trip card summaries

Add:

- visible trip filtering
- waypoint count
- photo count
- tap target for trip details
- redesigned card structure
- two-column metadata grid

### Phase 2: Delete with undo

Add:

- soft delete for trip
- local undo banner/snackbar
- restore path

### Phase 3: Edit trip metadata

Add:

- edit trip modal
- update title/description

### Phase 4: Trip details and waypoint editing

Add:

- trip details modal/screen
- waypoint note/title editing
- photo removal

### Phase 5: Polish

Improve:

- card layout
- summary labels
- photo preview presentation
- empty states
- spacing, contrast, and badge treatment

## Risks

### 1. UI bloat on the list screen

If too many actions sit directly on the trip card, the list becomes noisy.

Mitigation:

- keep cards summary-first
- move deeper editing into trip details

### 1a. Weak visual hierarchy

If metadata is rendered as one long list again, the card will still feel flat and noisy.

Mitigation:

- keep title/description visually dominant
- move metadata into a structured two-column grid
- separate actions from metadata

### 2. Undo state complexity

Delete with undo can become messy if multiple trips are deleted rapidly.

Mitigation:

- first version supports one pending undo item at a time
- keep the rule explicit

### 3. Hidden deleted data

Soft delete means data still exists locally.

Mitigation:

- centralize visible filtering
- ensure deleted trips, waypoints, and attachments are excluded from normal list rendering

## Completion criteria

This plan is complete when:

- trip cards show useful summaries including photo count
- trip cards have a stronger visual hierarchy with a compact metadata grid
- a trip can be deleted with undo
- trip title and description can be edited
- waypoint notes can be edited from trip management flow
- waypoint photos can be removed
- user can open a trip and inspect its photos and notes
