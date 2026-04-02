# PLAN 05: Waypoints And Media

## Goal

Allow the user to attach meaningful manual moments to an active route while recording, such as:

- a short note
- a photo
- a video

These user-created moments should be modeled as `Waypoint` records tied to the active trip and device.

This plan stays mobile-only.
It does not include backend sync work yet.

## Why this matters

Automatic route recording is not enough for many real trips.

The user may want to:

- remember a viewpoint
- mark a beach, trail fork, or restaurant
- write down a short observation
- attach a photo as context
- later attach a short video

These should not be treated as generic `TripPoint` samples.

The distinction should remain:

- `TripPoint` = automatic sampling created by recording logic
- `Waypoint` = manual user-created point of interest

## Desired user experience

While a route is actively recording:

1. the user taps an `Add note` or `Add waypoint` action
2. the app opens a lightweight create flow
3. the app uses the current location, or the latest known location, as the waypoint position
4. the user can add:
   - title
   - note text
   - optional photo later in the plan
   - optional video later in the plan
5. the waypoint is saved locally and linked to the active trip

The initial version should stay fast and simple.

## Scope

Included in this plan:

- note-based waypoint creation during active recording
- local waypoint persistence
- current-trip waypoint listing on mobile
- future-ready attachment model for photo and video

Not included in the first implementation slice:

- server sync
- background uploads
- waypoint editing history
- photo gallery UI
- video trimming
- web rendering

## Domain model

### Waypoint

`Waypoint` already exists and should remain the main user-created route annotation object.

Current fields are already close to what we need:

- `localId`
- `serverId`
- `tripLocalId`
- `deviceId`
- `userId`
- `latitude`
- `longitude`
- `title`
- `note`
- `createdAt`
- `updatedAt`
- `deletedAt`
- `syncStatus`

This is a good foundation for the first note-only version.

### WaypointAttachment

Add a new attachment model when we reach media support.

Suggested direction:

- `localId`
- `serverId`
- `waypointLocalId`
- `deviceId`
- `userId`
- `type: "photo" | "video"`
- `localUri`
- `mimeType`
- `fileSize`
- `durationMs` for video when applicable
- `createdAt`
- `updatedAt`
- `deletedAt`
- `syncStatus`

The important boundary is:

- attachments belong to a waypoint
- they do not replace the waypoint

## UX approach

### Phase 1: Note-only waypoint

First version should be minimal:

- one `Add note` action on the recording screen
- opens a modal or bottom sheet
- requires a short title
- note text is optional
- uses current location if available
- if current location is unavailable, use the last known recording position when possible

This is the best first slice because it proves:

- domain fit
- storage fit
- recording screen integration
- current-trip context

without adding camera, media library, or large file handling.

### Phase 2: Photo waypoint

Second version adds:

- `Take photo`
- possibly `Choose from library`

This will require:

- camera permission and/or photo library permission
- local file persistence strategy
- media attachment metadata

### Phase 3: Video waypoint

Third version adds:

- short video capture

This is intentionally later because video is heavier in:

- permissions
- local storage
- upload strategy
- preview UX

## Technical approach

### 1. Waypoint store and storage

Add dedicated waypoint state and storage files similar to trips:

- `src/state/waypoints-store.ts`
- `src/storage/waypoints-storage.ts`

The store should support:

- hydration
- set waypoints
- append waypoint
- query by active trip

### 2. Waypoint creation service

Add a waypoint service responsible for:

- creating a local waypoint object
- choosing the best available location source
- applying local metadata such as `deviceId`, `userId`, timestamps, and `syncStatus`

This should not live inside the screen component.

### 3. Recording screen integration

Add a recording-screen action for creating a waypoint while a trip is active.

First version can be:

- a compact `Add note` button in the current session panel

The screen should:

- open the create modal
- call the waypoint service
- save locally
- refresh the local list

### 4. Local list on the recording screen or trips screen

The user should quickly see that the waypoint was actually saved.

Recommended first version:

- show the latest waypoints for the active trip in a compact section
- title, note excerpt, created time

### 5. Media attachment boundary

Before adding photo/video, define the attachment storage boundary.

Important decisions:

- whether files stay in app cache or document storage
- how local URI is persisted
- how deleted attachments are tracked for later sync

## Suggested implementation phases

### Phase 1: Note-only waypoint domain and local persistence

Add:

- waypoint store
- waypoint storage
- create waypoint service
- local hydration

### Phase 2: Recording screen note flow

Add:

- `Add note` action
- note modal
- save to active trip using current location
- compact list of recent waypoints

### Phase 3: Photo attachments

Add:

- attachment model
- camera and/or image picker integration
- local file metadata persistence

### Phase 4: Video attachments

Add:

- video capture support
- attachment metadata for duration and file size

### Phase 5: UX polish

Improve:

- previews
- copy
- layout of waypoint cards
- empty states

## Risks

### 1. Missing location at note time

The user may create a waypoint before the current foreground location is ready.

Mitigation:

- use the latest known location if available
- otherwise block save and explain why

### 2. Media complexity too early

Photo and especially video introduce permissions and file lifecycle complexity quickly.

Mitigation:

- ship note-only waypoint first
- add attachments in later phases

### 3. Blurring `TripPoint` and `Waypoint`

If manual notes and automatic samples are mixed, later sync and UI will become muddy.

Mitigation:

- keep `TripPoint` automatic only
- keep `Waypoint` user-created only

## Completion criteria

The first implementation slice of this plan is complete when:

- the user can create a note waypoint during an active recording
- the waypoint is tied to the active trip, user, and device
- the waypoint stores location, title, and optional note locally
- saved waypoints are visible in the mobile UI
- the architecture leaves a clean path for photo and video attachments later
