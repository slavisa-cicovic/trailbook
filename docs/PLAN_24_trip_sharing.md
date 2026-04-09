# PLAN 24: Trip Sharing

## Goal

Introduce authenticated trip sharing so one Trailbook user can share a trip with another existing Trailbook user.

This plan should prepare the first real collaboration feature without attempting full multi-user sync or conflict resolution in the same step.

## Naming Decision

We should stop mixing `route`, `trail`, and `trip` in the implementation scope of this feature.

For this plan:

- domain name: `Trip`
- backend/API name: `trip sharing`
- mobile/web UX label may later say `Share trail` if that reads better to users

In other words:

- internally we implement `share trip`
- product copy can later say `Share trail` if desired

This keeps the model aligned with the existing mobile and server domain language.

## Why This Comes Next

The prerequisites are now in place:

- server auth exists
- web auth exists
- mobile auth exists
- demo and authenticated sessions are explicitly separated
- demo users are already treated as local-only

Trip sharing is the first feature that truly requires authenticated identity across devices and users.

## Product Rule

Only authenticated users can share trips.

That means:

- demo users cannot share
- demo users cannot receive shared trips as an authenticated collaboration feature
- a trip must belong to an authenticated owner before it becomes shareable

## V1 Use Case

The primary V1 flow is simple:

1. user A selects one of their trips
2. user A chooses `Share`
3. user A enters the recipient email
4. server validates that the recipient already exists and is not the same user as the authenticated owner
5. server creates a trip share record
6. recipient sees the shared trip in their account

This plan assumes:

- recipient must already have a Trailbook account
- recipient must not be the same user as the authenticated owner
- we do not implement public share links
- we do not implement anonymous viewing
- V1 shares the whole trip, not selected subsets of trip content

## V1 Access Model

V1 should be read-only for the recipient.

The owner can:

- keep editing their own trip
- decide later whether to revoke sharing

The recipient can:

- view the shared trip
- view trip route, segments, waypoints, and photos

The recipient cannot in V1:

- edit the shared trip
- delete the owner trip
- re-share the owner trip

## V1 Share Granularity

V1 should share the entire trip only.

That means:

- full trip metadata
- full route
- all segments
- all waypoints
- all photos belonging to that trip

This plan does not yet include partial sharing such as:

- only selected waypoints
- only selected photos
- curated subsets of one trip

Partial sharing is intentionally deferred because it would complicate:

- access rules
- server trip projection
- future sync behavior
- recipient-side UI expectations

## Scope Boundary

This plan does not yet include:

- billing enforcement
- public links
- invite flow for non-existing users
- collaborative editing
- shared comments
- full bidirectional sync conflict handling

It focuses on the first closed-loop authenticated share flow only.

## Core Domain Additions

Minimum new backend entities:

- `trip_shares`
- optionally `shared_trip_snapshots` or equivalent sync materialization if needed later

Minimum `trip_shares` fields:

- `id`
- `trip_id`
- `owner_user_id`
- `recipient_user_id`
- `status`
- `created_at`
- `updated_at`
- optional `revoked_at`

Suggested V1 statuses:

- `active`
- `revoked`

## Ownership Rule

A trip has exactly one owner.

Sharing does not transfer ownership.

This must remain true across:

- server persistence
- mobile local view model
- future sync model

## Server Scope

The server will need:

- owner-side share creation endpoint
- owner-side share listing endpoint
- recipient-side shared trip listing endpoint
- trip access guard logic

Minimum V1 API candidates:

- `POST /api/trips/:tripId/shares`
- `GET /api/trips/:tripId/shares`
- `DELETE /api/trips/:tripId/shares/:shareId`
- `GET /api/shared-trips`
- `GET /api/shared-trips/:tripId`

The exact route shape can still be adjusted, but the capability set should stay roughly this small.

## Access Enforcement

Server-side authorization must become explicit.

For any trip read request:

- owner can read
- active recipient can read
- everyone else is denied

For any trip write request:

- only owner can write in V1

Do not rely on client-side hiding alone.

## Mobile Scope

Mobile should gain:

- share action on owned authenticated trips
- share disabled or hidden for demo trips
- share disabled or hidden for trips that are not server-backed yet
- recipient-side `Shared with me` view

The existing trip card sync/share area will need refinement.

Future UI implication:

- demo trip should show local-only status, not normal share affordances
- authenticated owned trip can become shareable after sync prerequisites are satisfied
- received shared trip should be visually distinct from owned trip

For V1, shared trips should not be merged invisibly into the default owned trip list.

Preferred presentation:

- `My trips`
- `Shared with me`

This can be implemented as:

- separate screens
- or clearly separated top-level list modes

The key requirement is that ownership remains obvious.

## Web Scope

Web should gain:

- owned trip sharing UI
- shared trip list view
- read-only trip detail for received trips

Web is a good candidate for the first complete recipient-side experience because large-screen trip browsing is already one of its primary product goals.

## Notification And Refresh Model

V1 should not introduce server push or background polling for shared trip delivery.

Instead, the recipient-side experience should use explicit fetch and refresh.

Preferred V1 model:

- recipient opens `Shared with me`
- app fetches current shared trips from the server
- user can manually refresh, for example pull-to-refresh or a refresh action

This means V1 does not require:

- push notifications
- websocket delivery
- background mobile polling

Those can be added later if the product needs faster passive awareness.

## Sync Dependency

Trip sharing implies a server-readable trip representation.

Therefore this feature depends on introducing a minimal syncable trip model on the server side.

At minimum, before sharing is truly usable, the server must have enough trip data to serve:

- trip metadata
- route points
- segments
- waypoints
- photos or at least attachment metadata

This does not require full offline sync in one step, but it does require a first owner-to-server trip upload path.

## Suggested Delivery Order

### Phase 1

- define server trip ownership and sharing schema
- add trip access guard model

### Phase 2

- implement minimal owner trip upload/sync needed for server-side trip reads

### Phase 3

- implement owner share creation and revocation

### Phase 4

- implement recipient shared trip listing and read-only detail

### Phase 5

- add mobile share action and shared-trip browsing

### Phase 6

- add web share management and shared-trip browsing polish

## UI Readiness Notes

The current mobile trip cards should evolve later into a clearer ownership/access presentation.

Likely future states:

- `Local only`
- `Pending sync`
- `Synced`
- `Shared`
- `Shared with me`

The plan should not force those exact labels now, but the state model should be designed so those labels are possible.

Shared trips must be visually distinct from owner trips.

At minimum, V1 should expose enough state for UI to show:

- read-only status
- owner identity
- non-owner presentation

## Risks To Avoid

- mixing trip ownership with share access
- allowing demo users into half-working share flows
- implementing sharing before the server can actually serve trip content
- treating recipient copies as separate owned trips
- letting client UI define access rules that the server does not enforce

## Done Criteria

This plan is complete when:

- an authenticated owner can share a synced trip with another existing user
- the recipient can see that trip in a read-only shared area
- demo users cannot enter the share flow
- ownership and share access are explicitly enforced on the server
- trip sharing is modeled as access to one owned trip, not as duplicated local ownership
