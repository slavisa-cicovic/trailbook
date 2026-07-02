# PLAN 67: Trip Grouping Domain Model

## Goal

Add user-owned trip grouping as a first-class domain feature.

Examples:
- a travel collection, e.g. Corfu trip
- repeated daily walks
- related test/diagnostic trips
- any user-defined collection of trips

## Architectural Decision

Trip grouping must not depend on `raw_bundle`.

`raw_bundle` is a transitional/debug storage detail used while the recording pipeline is still being refined. Later it should remain only for `test_user`/diagnostic flows. Grouping must survive that transition without schema or UI redesign.

Therefore:
- groups are normal domain entities,
- memberships reference trips by stable `clientTripId`,
- group sync/restore is separate from raw trip bundle upload,
- group UI reads trip summary/read models, not raw points.

## Product Decisions

- A trip can belong to multiple groups.
- A group has `title` and optional `description`.
- A group belongs to exactly one user.
- Deleting a group does not delete trips.
- Removing a trip from a group does not delete the trip.
- First version supports only current user's own trips.
- First version allows grouping only for trips that are already `SYNCED`.
- Demo users do not see grouping actions because demo trips cannot be synced.
- Sharing groups is a later use case and should build on this model.

## Mobile Domain

Add `TripGroup`:

```ts
export interface TripGroup {
  id: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  syncState: 'PENDING' | 'SYNCED' | 'FAILED';
}
```

Add `TripGroupMember`:

```ts
export interface TripGroupMember {
  id: string;
  groupId: string;
  tripClientId: string;
  orderIndex: number;
  addedAt: Date;
  removedAt: Date | null;
  syncState: 'PENDING' | 'SYNCED' | 'FAILED';
}
```

Notes:
- `id` is client-generated UUID.
- `tripClientId` references `Trip.clientTripId`.
- Use client IDs as stable sync identities.

## Mobile SQLite

Add tables:
- `trip_groups`
- `trip_group_members`

Suggested columns:

`trip_groups`
- `id text primary key`
- `title text not null`
- `description text`
- `created_at text not null`
- `updated_at text not null`
- `deleted_at text`
- `sync_state text not null`

`trip_group_members`
- `id text primary key`
- `group_id text not null`
- `trip_client_id text not null`
- `order_index integer not null`
- `added_at text not null`
- `removed_at text`
- `sync_state text not null`

Suggested indexes:
- `trip_groups(deleted_at, updated_at)`
- `trip_group_members(group_id, removed_at, order_index)`
- `trip_group_members(trip_client_id, removed_at)`
- unique active membership guard if practical: `(group_id, trip_client_id, removed_at)`

## Mobile Data Layer

Follow current architecture:
- domain model under `mobile/src/core/domain/model`
- DAO under `mobile/src/core/data/local`
- repository implementation under `mobile/src/core/data/repository`
- use cases under `mobile/src/core/domain/usecase`
- feature UI under `mobile/src/feature/trip-groups` or `mobile/src/feature/trips`

Repository responsibilities:
- create/update/delete groups,
- add/remove trips from groups,
- list groups with summary,
- list group members with trip read models,
- track pending sync state.

## Backend Model

Add normal tables, not raw JSON:

`trip_groups`
- `id bigserial primary key`
- `client_group_id varchar(36) not null unique`
- `user_id varchar(50) not null`
- `title varchar(500) not null`
- `description text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz`

`trip_group_members`
- `id bigserial primary key`
- `client_member_id varchar(36) not null unique`
- `client_group_id varchar(36) not null`
- `client_trip_id varchar(36) not null`
- `user_id varchar(50) not null`
- `order_index int not null`
- `added_at timestamptz not null`
- `removed_at timestamptz`
- `updated_at timestamptz not null default now()`

Ownership validation:
- group must belong to authenticated user,
- trip must belong to authenticated user,
- user cannot add someone else's trip to a group.

## Backend API

Add endpoints under `/api/v1/trip-groups`.

Minimum endpoints:
- `GET /trip-groups`
- `POST /trip-groups/sync`
- `GET /trip-groups/:clientGroupId`

`GET /trip-groups` returns:
- group metadata,
- members,
- enough trip summary to render group cards if practical.

`POST /trip-groups/sync` accepts pending local changes:

```ts
interface SyncTripGroupsRequest {
  groups: SyncTripGroupDto[];
  members: SyncTripGroupMemberDto[];
}
```

```ts
interface SyncTripGroupDto {
  clientGroupId: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

```ts
interface SyncTripGroupMemberDto {
  clientMemberId: string;
  clientGroupId: string;
  clientTripId: string;
  orderIndex: number;
  addedAt: string;
  updatedAt: string;
  removedAt: string | null;
}
```

First conflict strategy:
- client IDs make operations idempotent,
- latest `updatedAt` wins for group metadata,
- membership add/remove is idempotent by `clientMemberId`,
- no complex merge UI in v1.

## Restore

Restore should fetch group metadata after trips are restored.

Important:
- If a group references a trip that is not restored locally, keep membership but do not crash UI.
- Group detail should show available trips and optionally a missing-trip placeholder later.
- Do not read raw bundle to render group summaries.

## Mobile UI

### Trips Selection Mode

Entry:
- long press on a trip card enters selection mode.

Selection behavior:
- tap toggles selected trip while in selection mode,
- normal tap opens trip when not in selection mode,
- only `SYNCED` trips can be selected,
- non-synced trips show a clear `Sync trip before grouping` message,
- selected count is visible,
- actions: `Add to group`, `Cancel`.

### Add To Group Flow

User can:
- create a new group with title/description,
- or choose existing group.

After save:
- selected trips are added as members,
- group/member sync state becomes `PENDING`,
- selection mode exits.

### Groups List

Add a groups entry point from Trips screen.

Possible first UI:
- segmented control or header action: `Trips | Groups`.
- group cards show:
  - title,
  - description preview,
  - trip count,
  - total distance,
  - date range or latest trip date.

### Group Detail

Group detail shows:
- title,
- description,
- trip cards for members,
- edit group metadata,
- remove trip from group.

Trip cards navigate to existing Trip Details.

## Summary Calculation

Use existing trip read models:
- segment distances for total distance,
- trip started/ended dates for range,
- waypoint/photo counts if useful.

Do not calculate summaries from raw locations.

## Implementation Phases

### Phase A: Mobile Local Domain

- Add domain models.
- Add SQLite tables/migrations.
- Add DAO/repository/use cases.
- Add local-only tests/manual checks.

### Phase B: Mobile UI

- Add Trips selection mode.
- Add Add To Group sheet.
- Add Groups list.
- Add Group detail screen.

### Phase C: Backend

- Add database tables.
- Add DTOs, service, controller.
- Add ownership validation.
- Add idempotent sync endpoint.

### Phase D: Sync/Restore

- Mobile uploads pending group changes.
- Restore fetches groups/members after trips.
- Sync errors are visible but do not block trip recording.

### Phase E: Sharing Preparation

- Ensure group detail has stable `clientGroupId`.
- Keep UI/data model ready for future share links.
- Do not implement sharing in this plan.

## Manual Verification

- Create group with multiple trips.
- Add trip to existing group.
- Same trip can be in two groups.
- Remove trip from group without deleting trip.
- Delete group without deleting trips.
- Edit group title/description.
- Restore on another device recreates groups and memberships.
- Sync failure leaves group changes pending.
- No raw bundle dependency exists in group UI/repository.

## Implementation Status

Implemented v1:
- synced-trip-only grouping rule,
- demo-user hidden grouping UI,
- local SQLite group/member model,
- mobile repository/usecase flow,
- Trips screen selection mode and Groups tab,
- backend Prisma model and `/trip-groups` sync/list endpoints,
- restore pulls group metadata after trips.

## Risks

- Selection mode can complicate Trips screen if not isolated.
- Group summaries can become slow if they load too much trip detail.
- Sync conflict rules are intentionally simple; this is acceptable for v1.
- Existing `PLAN_50_trip_groups.md` is based on older architecture and should not be used as implementation source without adapting to this plan.
