# PLAN 68: Trip Sharing Domain Model

## Goal

Add read-only sharing between authenticated Trailbook users.

V1 sharing is intentionally not public-link sharing. The first version should support:

- owner shares a synced trip with another existing Trailbook user by email,
- recipient sees the shared trip under `Shared with me`,
- recipient can view route, segments, waypoints and photos,
- recipient cannot edit, delete, reprocess, sync, group or re-share the owner trip.

## Architectural Decision

Sharing must be a normal backend domain feature, not a `raw_bundle` convention.

`raw_bundle` may be removed later for non-test users. Sharing should therefore rely on stable server-side ownership and access records:

- `trips.user_id` remains the owner,
- `trip_shares` grants read-only access to a recipient,
- shared trip detail returns the same bundle/read payload as owner trip detail, but through a read-only endpoint,
- mobile stores shared trips separately from owned local trips.

Do not copy trips into recipient ownership in V1.

## Product Rules

- Demo users cannot share or receive shared trips.
- Only authenticated users can share.
- A trip must be synced before it can be shared.
- Recipient must already exist by email.
- Owner cannot share a trip with themself.
- Sharing is read-only.
- Owner can revoke sharing.
- Recipient can hide/remove a shared trip from their local list later, but that is not owner deletion.

## Scope Boundary

V1 does not include:

- public share links,
- anonymous viewing,
- non-existing-user invitations,
- collaborative editing,
- comments,
- partial trip sharing,
- group sharing.

Group sharing should be PLAN_68B or PLAN_69 after trip sharing is stable. It can reuse the same shape with `targetType = GROUP`.

## Backend Schema

Add `trip_shares`:

- `id uuid primary key default gen_random_uuid()`
- `client_share_id varchar(36) unique`
- `trip_id bigint not null references trips(id)`
- `owner_user_id uuid not null references users(id)`
- `recipient_user_id uuid not null references users(id)`
- `status varchar(50) not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `revoked_at timestamptz`

Indexes:

- `(owner_user_id, created_at desc)`
- `(recipient_user_id, created_at desc)`
- `(trip_id)`

Unique active share guard:

- one active share per `(trip_id, recipient_user_id)` if practical.

Suggested statuses:

- `active`
- `revoked`

## Backend API

Owner endpoints:

- `POST /trips/:clientTripId/shares`
- `GET /trips/:clientTripId/shares`
- `DELETE /trips/:clientTripId/shares/:shareId`

Recipient endpoints:

- `GET /shared-trips`
- `GET /shared-trips/:clientTripId`

`POST /trips/:clientTripId/shares` body:

```ts
interface CreateTripShareRequest {
  recipientEmail: string;
}
```

Response:

```ts
interface TripShareDto {
  id: string;
  clientTripId: string;
  ownerUserId: string;
  recipientUserId: string;
  recipientEmail: string;
  status: 'active' | 'revoked';
  createdAt: string;
  revokedAt: string | null;
}
```

`GET /shared-trips` response:

```ts
interface SharedTripListItemDto {
  clientTripId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  ownerDisplayName: string;
  ownerEmail: string;
  sharedAt: string;
}
```

`GET /shared-trips/:clientTripId` response:

- same `TripBundleDto` as owned trip restore/detail,
- but authorization is based on active share.

## Backend Authorization

Owned trip read/write remains owner-only through existing `/trips` endpoints.

Shared read uses separate `/shared-trips` endpoints:

- active recipient can read,
- owner can read through normal owned endpoints,
- revoked share denies access.

Write access remains owner-only:

- upload/update/delete only through owner `trips.user_id`,
- recipient never writes to owner trip in V1.

## Mobile Domain

Add read-only shared trip model:

```ts
export interface SharedTripListItem {
  clientTripId: string;
  title: string;
  startedAt: Date;
  endedAt: Date | null;
  ownerDisplayName: string;
  ownerEmail: string;
  sharedAt: Date;
}
```

Do not merge shared trips into owned `Trip` table in V1.

Reason:

- owned trips are local editable recording entities,
- shared trips are remote read-only projections,
- mixing them would make sync/delete/reprocess permissions fragile.

## Mobile Data Layer

Follow current architecture:

- DTO/data source under `mobile/src/core/data/remote`,
- repository implementation under `mobile/src/core/data/repository`,
- domain use cases under `mobile/src/core/domain/usecase`,
- UI under `mobile/src/feature/trips`.

Minimum mobile repository operations:

- `shareTrip(clientTripId, recipientEmail)`
- `listTripShares(clientTripId)`
- `revokeTripShare(clientTripId, shareId)`
- `listSharedTrips()`
- `getSharedTripBundle(clientTripId)`

## Mobile UI

### Owner Trip Detail

Enable existing Share action when:

- user is authenticated,
- trip is `SYNCED`,
- trip is owned/local.

Share flow:

- tap share icon,
- open small modal/sheet,
- enter recipient email,
- submit,
- show success/error through `CustomAlertDialog`.

Hide or disable share for:

- demo user,
- unsynced trip,
- shared recipient view.

### Shared With Me

Use the existing `Shared with me` tab in Trips.

V1 behavior:

- fetch remote shared list on tab open/refresh,
- show read-only cards,
- tap card opens shared trip detail.

Shared trip detail:

- reuse map/detail display components where possible,
- no sync button,
- no reprocess/undo,
- no edit,
- no waypoint photo add/delete,
- no grouping actions.

## Restore And Offline

V1 can be online-first for shared trips.

Do not persist shared trips into owned local tables yet.

If offline support is needed later:

- add separate `shared_trip_cache`,
- cache server read projection,
- keep it read-only.

## Implementation Phases

### PLAN_68A: Backend Trip Shares

- Add Prisma `TripShare`.
- Add `TripSharesModule`.
- Implement owner share create/list/revoke.
- Implement recipient shared list/detail.
- Add authorization tests or at least typecheck/manual curl checks.

### PLAN_68B: Mobile Owner Share UI

- Add mobile `TripShareRepositoryImpl`.
- Wire Trip Detail share action to recipient email modal.
- Enforce synced/authenticated-only UI.

### PLAN_68C: Mobile Shared With Me

- Implement `Shared with me` tab.
- Add read-only shared trip detail path.
- Reuse route/waypoint/photo presentation where safe.

### PLAN_68D: Group Sharing

- Extend share target from `TRIP` to `GROUP`, or add parallel `trip_group_shares`.
- Recipient sees grouped shared trips in group order.
- Keep recipient read-only.

## Validation

- Owner can share synced trip with another existing user.
- Owner cannot share unsynced trip.
- Owner cannot share with self.
- Demo user cannot share.
- Recipient sees shared trip under `Shared with me`.
- Recipient can open route, waypoints and photos.
- Recipient cannot edit/reprocess/sync/delete.
- Owner can revoke and recipient loses access.

