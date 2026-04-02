# PLAN 07: Waypoint Photo Attachments

## Goal

Allow the user to attach one or more photos to a waypoint while recording a route.

This plan stays mobile-only.
It does not include backend sync work.
It does not include video yet.

## Why this matters

The current note-only waypoint flow is useful, but many route moments are better captured visually:

- viewpoint
- beach access
- trail marker
- restaurant or cafe
- parking location

Photo support is the next natural step because it adds high value without the full complexity of video.

## Scope

Included in this plan:

- photo attachment domain model
- local photo attachment persistence
- camera and/or image picker integration
- attaching photos during waypoint creation
- showing attached photos in waypoint UI

Not included in this plan:

- video
- backend upload
- image editing
- image compression pipeline tuning
- full gallery screen

## UX direction

### Create waypoint with photo

While a route is active:

1. user taps `Add note`
2. waypoint modal opens
3. user can:
   - enter title
   - enter note
   - add a photo
4. photo may come from:
   - camera
   - photo library
5. waypoint and photo attachment are saved locally together

### View waypoint photos

The recording screen contextual panel should show a compact preview for recent waypoint photos when available.

The first version should stay simple:

- small thumbnail
- one preview image per waypoint card is enough for now

## Domain model

Add a new attachment model:

- `WaypointAttachment`
  - `localId`
  - `serverId`
  - `waypointLocalId`
  - `deviceId`
  - `userId`
  - `type: "photo"`
  - `localUri`
  - `mimeType`
  - `fileSize`
  - `createdAt`
  - `updatedAt`
  - `deletedAt`
  - `syncStatus`

Important:

- attachments belong to a waypoint
- waypoint remains the parent object
- photo metadata is stored separately from waypoint text/location

## Technical approach

### 1. Attachment store and storage

Add:

- `src/state/waypoint-attachments-store.ts`
- `src/storage/waypoint-attachments-storage.ts`

The store should support:

- hydration
- set attachments
- append attachments
- query attachments by waypoint

### 2. Media picker boundary

Add a dedicated media service for photo selection/capture.

This service should handle:

- camera permission
- media library permission when needed
- returning normalized photo metadata

Do not embed Expo image picker logic directly inside the screen.

### 3. Waypoint creation flow

Extend the current waypoint modal:

- keep title required
- keep note optional
- add `Take photo`
- optionally add `Choose from library`

When the user saves:

- create the waypoint
- create related photo attachment records
- persist both locally

### 4. Rendering

Recent waypoint cards on the recording screen should show:

- title
- note excerpt
- thumbnail if a photo exists

## Suggested implementation phases

### Phase 1: Domain and local persistence

Add attachment model, storage, and hydration.

### Phase 2: Photo picking

Integrate camera or image picker through a media service.

### Phase 3: Waypoint modal support

Allow adding one photo during waypoint creation.

### Phase 4: Photo preview

Show thumbnail previews on recent waypoint cards.

### Phase 5: Polish

Improve:

- permission messaging
- thumbnail sizing
- attachment empty/loading states

## Risks

### 1. Permission friction

Camera and photo library permissions may interrupt the flow.

Mitigation:

- keep note-only save possible
- ask for permissions only when user taps the photo action

### 2. Local URI stability

Some picked assets may need normalization before long-term local use.

Mitigation:

- start with stored local URI metadata
- keep the abstraction in a media service for future hardening

### 3. UI overload

Too much media UI in the waypoint modal will make note-taking slower.

Mitigation:

- keep the first version to one photo attachment
- keep the visual treatment compact

## Completion criteria

This plan is complete when:

- user can attach a photo to a waypoint during active recording
- photo attachment is stored locally and linked to the waypoint
- recent waypoint cards can show a compact photo preview
- note-only waypoint creation still works without requiring a photo
