# PLAN 50: Trip Groups

## Goal

Allow users to group related trips into named collections.

Examples:

- all trips from a Corfu journey
- daily walks with a friend
- repeated bike/drive routes that the user wants to compare later

Trip groups are user-owned metadata and should sync between devices.

## Product Decisions

- A trip can belong to multiple groups.
- Groups should sync to the backend immediately like other user trip metadata.
- First version supports only user-owned trips, not imported shared trips.
- Group summaries should use existing stored trip stats, not recalculate from points.
- Groups should be soft-deletable.
- Trip membership should be soft-removable or replaceable without deleting the trip itself.

## Data Model

### Mobile Domain

Add `TripGroup`:

```ts
interface TripGroup {
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  localId: string;
  serverId: string | null;
  title: string;
  updatedAt: string;
  userId: string;
}
```

Add `TripGroupMember`:

```ts
interface TripGroupMember {
  createdAt: string;
  deletedAt: string | null;
  groupLocalId: string;
  localId: string;
  serverId: string | null;
  sortOrder: number;
  tripLocalId: string;
  updatedAt: string;
  userId: string;
}
```

### Mobile SQLite

Add tables:

- `trip_groups`
- `trip_group_members`

Suggested indexes:

- `trip_groups(user_id, deleted_at, updated_at)`
- `trip_group_members(user_id, group_local_id, deleted_at, sort_order)`
- `trip_group_members(user_id, trip_local_id, deleted_at)`
- unique active membership guard if practical: `(group_local_id, trip_local_id, deleted_at)`

### Backend Prisma

Add `TripGroup`:

- `id`
- `localId`
- `userId`
- `title`
- `description`
- `createdAt`
- `updatedAt`
- `deletedAt`
- relation to `User`
- relation to `TripGroupMember`

Add `TripGroupMember`:

- `id`
- `localId`
- `groupId`
- `groupLocalId`
- `tripId`
- `tripLocalId`
- `userId`
- `sortOrder`
- `createdAt`
- `updatedAt`
- `deletedAt`
- relation to `TripGroup`
- relation to `Trip`
- relation to `User`

Backend should validate ownership: a user can only add their own trips to their own groups.

## Sync Contract

Trip groups should be part of normal mobile sync/restore.

### Upload

Mobile sends:

- changed groups
- changed memberships

Suggested endpoints:

- `POST /mobile/trip-groups/sync`
- or extend existing trip sync payload if that remains simpler

Payload should support:

- create/update group
- soft-delete group
- add/remove membership
- preserve `localId` mapping

### Restore

Backend returns:

- groups for the authenticated user
- memberships for those groups

Mobile stores them locally before rendering group screens.

### Conflict Strategy

Use current app pattern:

- `localId` is stable client identity.
- `serverId` is assigned after sync.
- `updatedAt` decides last-write-wins for group metadata.
- Membership add/remove is idempotent by `groupLocalId + tripLocalId`.

## Mobile UI

### TripsScreen Selection Mode

Entry:

- long press on a trip card enters selection mode
- selected trip toggles on tap
- normal tap remains route opening when not in selection mode

Selection mode UI:

- selected count in header or bottom action bar
- `Add to group`
- `Cancel`
- optional later: `Select all visible`

### Add To Group Flow

When user taps `Add to group`:

1. Show modal/screen.
2. User can choose existing group or create a new group.
3. New group form fields:
   - `title`
   - `description`
4. Save creates group if needed and adds selected trips as members.
5. Exit selection mode.

### Group List

Add a groups entry point from `TripsScreen`.

First implementation can be simple:

- top tab/chip: `Trips | Groups`
- group cards show:
  - title
  - description preview
  - trip count
  - total distance
  - total duration
  - last updated/last trip date

### TripGroupScreen

Tap group card opens a group detail screen.

Screen shows:

- group title and description
- aggregate summary
- list of member trips
- option to edit group metadata
- option to remove trip from group

Do not duplicate route rendering logic in first phase. Trip cards in group detail can navigate to existing `TripRouteScreen`.

## Summary Calculation

Use denormalized trip stats from `trips`:

- `distanceMeters`
- duration from trip start/end or stored stats if available
- trip count

Do not load trip points just to render group summaries.

If stats are missing:

- show partial summary
- optionally trigger existing stats repair/backfill separately

## Backend API Shape

Suggested DTOs:

```ts
interface SyncTripGroupDto {
  deletedAt: string | null;
  description: string | null;
  localId: string;
  serverId: string | null;
  title: string;
  updatedAt: string;
}

interface SyncTripGroupMemberDto {
  deletedAt: string | null;
  groupLocalId: string;
  localId: string;
  serverId: string | null;
  sortOrder: number;
  tripLocalId: string;
  updatedAt: string;
}
```

Response returns normalized server IDs for groups and memberships.

## Implementation Steps

1. Add domain types for `TripGroup` and `TripGroupMember`.
2. Add mobile SQLite tables, storage modules, hydration stores, and selectors.
3. Add backend Prisma models and push/migration.
4. Add backend DTOs, service, controller, and ownership validation.
5. Add mobile sync/restore support.
6. Add `TripsScreen` selection mode and `Add to group` modal.
7. Add groups list and group detail screen.
8. Add edit/remove group actions.
9. Add tests or at least manual verification checklist.

## Manual Verification

- Create a new group from selected trips.
- Add trips to an existing group.
- Remove one trip from a group without deleting the trip.
- Delete group without deleting member trips.
- Sync group to backend.
- Reinstall app and restore groups.
- Verify one trip can belong to two groups.
- Verify group summary does not load raw points.
- Verify shared/imported trips are not groupable in v1.

## Risks

- Selection mode can complicate existing swipe/press behavior on `TripsScreen`.
- Multi-group membership needs clear UI to avoid confusing users.
- Sync conflicts around membership removal need idempotent handling.
- Group summary performance depends on PLAN 49 stats snapshot being stable.

## Non-Goals For V1

- Sharing groups publicly.
- Group cover photos.
- Comparing repeated routes.
- Automatic group suggestions.
- Grouping shared trips imported from other users.
