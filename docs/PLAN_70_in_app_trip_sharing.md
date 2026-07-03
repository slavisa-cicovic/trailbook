# PLAN 70: In-App Trip Sharing

## Goal

Allow a Trailbook user to share a synced trip with another Trailbook user, so the recipient sees it in one place under `Shared with me`.

This is distinct from public Viber/WhatsApp sharing:

- public sharing uses a PIN-protected URL;
- in-app sharing uses an explicit user-to-user access relation;
- in-app shared trips are read-only for the recipient.

## Status

Implemented:

- backend `trip_user_shares` model;
- owner endpoint to share a trip with an existing Trailbook user by email;
- recipient endpoint to list trips shared with them;
- recipient endpoint to open read-only shared trip details with route, segments, waypoints and image URLs;
- mobile owner dialog for sharing with a Trailbook user by email;
- mobile `Shared with me` tab populated from backend;
- mobile read-only shared trip detail screen.

Not implemented yet:

- revoke UI;
- group sharing;
- invite flow for users that do not exist yet;
- notifications.

## Constraints

- Only the trip owner can share a trip.
- Only synced trips can be shared.
- The recipient must be an existing Trailbook user in the first version.
- Shared trips must be read-only for recipients.
- Shared trips must not be copied into the recipient's local trip ownership model.
- Shared trips should be remote-only initially to avoid sync, delete and ownership conflicts.

## Phase 1: Backend Share Model

Add a `trip_user_shares` table/model:

- `id`
- `client_trip_id`
- `owner_user_id`
- `recipient_user_id`
- `created_at`
- `revoked_at`

Constraints:

- unique active share per `(client_trip_id, recipient_user_id)`;
- indexes by `owner_user_id`, `recipient_user_id`, `client_trip_id`;
- cascade or safe cleanup when owner/user is deleted.

## Phase 2: Backend Endpoints

Add authenticated endpoints:

- `POST /trips/:clientTripId/share/users`
  - body: `{ email: string }`
  - owner-only;
  - trip must exist, belong to owner and not be deleted;
  - recipient email must exist;
  - recipient cannot be owner;
  - create or reactivate share relation.

- `GET /trips/shared-with-me`
  - list trips shared with current user;
  - return lightweight trip cards.

- `GET /trips/shared-with-me/:clientTripId`
  - return read-only shared trip detail payload;
  - include route, segments, waypoints and waypoint image URLs.

- `DELETE /trips/:clientTripId/share/users/:recipientUserId`
  - owner-only revoke.

## Phase 3: Mobile Remote Data Source

Add remote calls:

- share trip with user by email;
- list shared-with-me trips;
- fetch shared trip detail;
- revoke share later if needed.

Keep this in the existing repository/use-case structure. No direct API calls from screens.

## Phase 4: Owner UI

On owner `TripDetailScreen`:

- add action `Share with Trailbook user`;
- open a small dialog with email input;
- require synced trip;
- show success/error through existing custom alert.

This action is separate from the public native share action.

## Phase 5: Shared With Me Tab

Use existing `Shared with me` tab on `TripsScreen`.

First version:

- load remote shared trip list;
- show trip cards similar to local trip cards;
- no sync/delete/reprocess actions;
- tap opens shared trip detail.

## Phase 6: Shared Trip Detail

Implement read-only detail view:

- map route;
- waypoint markers;
- waypoint photo preview;
- timeline;
- trip title/description/stats;
- no edit;
- no sync;
- no delete;
- no reprocess;
- no local ownership mutation.

Prefer reusing presentational map/detail components where practical, but do not force the existing local `TripDetailScreen` if it creates ownership/sync complexity.

## Phase 7: Validation

Test:

- owner shares with another user by email;
- recipient sees trip in `Shared with me`;
- recipient opens details, map, waypoints and photos;
- recipient cannot edit/sync/delete/reprocess;
- owner can still edit/sync their own trip;
- revoked share disappears or becomes inaccessible.

## Later

- Share groups.
- Invite flow for emails that are not registered yet.
- Notifications for received shares.
- Recipient offline cache if needed.
- Owner UI for listing and revoking users with access.
