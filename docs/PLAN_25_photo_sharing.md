# PLAN 25: Photo Sharing

## Goal

Extend trip sharing so shared trips can include waypoint photos, with read-only viewing for recipients.

This phase should add the first real media pipeline for Trailbook without attempting a full cloud storage architecture yet.

## Why This Comes Next

The current sharing flow already covers:

- trip metadata
- route points
- segments
- waypoint metadata

The biggest remaining gap is photo content.

Without photo sharing, a shared trip is still incomplete for many real travel use cases.

## V1 Product Rules

Photo sharing in V1 should follow the existing trip sharing rules:

- only authenticated users can sync and share photos
- demo users remain local-only
- recipients get read-only access
- ownership stays with the original trip owner

Recipient access should be derived from the same trip access guard as the rest of the shared trip content.

## Storage Strategy

V1 should use filesystem storage for local and development environments.

The storage root must be defined through server environment configuration, not hardcoded in the application.

Suggested environment variable:

- `MEDIA_STORAGE_DIR`

Example intent:

- `MEDIA_STORAGE_DIR=/absolute/path/to/trailbook-media`

The server should create and manage subdirectories below that root as needed.

## Important Storage Constraint

The server must not expose arbitrary filesystem paths directly.

Instead:

- photo attachment metadata is stored in the database
- file access is resolved through server attachment records
- download and image serving go through authenticated server endpoints
- access is guarded by owner-or-shared-recipient authorization

This avoids turning the configured media directory into an unguarded file server.

## V1 Data Model Direction

We need persisted server-side photo attachment records.

Minimum fields:

- `id`
- `trip_id`
- `waypoint_id`
- `owner_user_id`
- `local_source_id`
- `mime_type`
- `original_filename`
- `storage_key` or relative file path
- `file_size_bytes`
- `created_at`
- `updated_at`
- optional `deleted_at`

The storage reference should point to a server-managed path under `MEDIA_STORAGE_DIR`, not to a raw mobile local URI.

## Upload Model

The owner remains the only uploader/editor in V1.

Suggested flow:

1. mobile sync detects local waypoint attachments for an owned trip
2. mobile uploads attachment binaries to the server
3. server stores files under `MEDIA_STORAGE_DIR`
4. server stores attachment metadata in the database
5. owner trip sync and shared trip reads now include photo attachment metadata

We should not attempt recipient uploads, edits, or comments in this phase.

## Share Access Model

Photo access should behave exactly like shared trip access:

- owner can read
- active recipient can read
- everyone else is denied

There should be no separate photo share rule outside the trip share guard.

If a trip share is revoked, shared photo access must disappear with it.

## Mobile Scope

Mobile should gain:

- owner-side upload/sync of waypoint photo attachments to the server
- shared trip photo indicators that reflect real shared attachments
- shared waypoint detail with read-only photo gallery
- shared photo viewer modal, or reuse of the existing photo viewer in read-only mode

The recipient should be able to:

- see photo presence on map markers or waypoint cards
- open shared waypoint photo gallery
- browse full-size shared photos

The recipient should not be able to:

- add photos
- delete photos
- edit photo metadata

## Server Scope

The server will need:

- photo upload endpoint(s)
- attachment metadata persistence
- attachment list/read endpoint(s)
- guarded photo file serving endpoint(s)
- trip read payloads extended with shared photo attachment metadata

Candidate V1 capability set:

- upload attachment binary
- list trip or waypoint attachments
- fetch guarded image by attachment id

The exact route shape can still be adjusted.

## Web Scope

Web does not need to lead this phase, but the resulting server model should not block later web photo browsing and download.

That means:

- attachment metadata should be reusable by web
- guarded file serving should already work for browser download flows

## Sync And Refresh Behavior

The existing sharing refresh rule still applies:

- owner uploads/syncs photos
- owner syncs the trip
- recipient refreshes shared trip or shared waypoint
- recipient sees the new photo state

V1 still does not require:

- push notifications
- background polling

## File Naming And Organization

The exact folder layout can be decided during implementation, but it should be deterministic and server-managed.

Reasonable options include grouping by:

- owner user
- trip id
- waypoint id

The key rule is that the database remains the source of truth for attachment lookup.

## Risks To Avoid

- storing mobile local URIs as if they were server media references
- serving files directly from arbitrary paths
- duplicating photo files per recipient
- mixing photo access rules with client-only visibility
- putting binary image content into PostgreSQL as a first-step shortcut

## Suggested Delivery Order

### Phase 1

- define server attachment schema and media config
- introduce `MEDIA_STORAGE_DIR` env configuration

### Phase 2

- add owner upload endpoint and filesystem persistence
- store attachment metadata in the database

### Phase 3

- extend shared trip payloads with attachment metadata
- add guarded image fetch endpoint

### Phase 4

- add mobile owner upload sync integration
- add recipient shared photo browsing UI

## Done Criteria

This plan is complete when:

- owner can sync waypoint photos to the server
- shared trips expose real photo attachment metadata
- recipient can open shared waypoint photos in read-only mode
- photo file access is protected by server-side access checks
- filesystem media storage root is configured through `.env`, not hardcoded
