# PLAN 36: Web User Trip Overview

## Goal

Add a real web trip overview page for authenticated users with role `user`.

This page should give the user:

- a total summary over all their trips
- a filtered summary for a selected date range
- a trip list similar in spirit to mobile `Trips`, but with a little more density and a few extra details

This is not an admin page. It is the normal signed-in user view.

## Product intent

When a normal user signs in on the web:

- `/dashboard` should stay admin-only
- `/trips` should become the main user landing page

The web trip overview should answer:

- how many trips the user has in total
- how many trips fall in the selected range
- how many waypoints and photos those selected trips contain
- what the user’s recent/filtered trip history looks like in a more table-like view than on mobile

## Date range model

This page needs both:

- `Total`
- date-based filters

Recommended range tabs:

1. `Total`
2. `Today`
3. `This week`
4. `This month`
5. `This year`
6. `Custom`

Important distinction:

- `Total` means no date filter at all
- other tabs filter by trip date range
- `Custom` exposes `from` / `to` inputs

As with the admin dashboard:

- the web layer computes concrete ISO `from` / `to`
- backend receives either:
  - no range at all for `Total`
  - or explicit `from` / `to`

Recommended filtering basis:

- `trips.started_at`

That is the most intuitive basis for a trip overview page.

## Page layout

The page should be composed of:

1. page header
2. date range tabs
3. optional custom date controls
4. summary cards
5. trip list/table

This keeps the page familiar with the new admin dashboard, but focused on the user’s own data.

## Summary content

### Total summary

Always show a lightweight total row/card group for all owned trips:

- `Total trips`
- `Total waypoints`
- `Total photos`

Optional V1.1:

- `Total trip points`
- `First trip date`
- `Last trip date`

### Selected range summary

Show the same shape, but for the active tab range:

- `Trips`
- `Waypoints`
- `Photos`

Optional:

- `Trip points`

If the active tab is `Total`, the selected summary and total summary are identical. In that case, we can either:

- still show both for consistency, or
- collapse to one summary block

Recommended V1 choice:

- show one summary block whose label changes
  - `All trips`
  - or `Selected range`

That is cleaner and avoids duplication.

## Trip list/table

This page should be more information-dense than mobile.

Recommended columns for V1:

- `Title`
- `Profile`
- `Started`
- `Ended`
- `Waypoints`
- `Photos`
- `Updated`

Optional V1.1:

- `Segments`
- `Shared`
- `Sync status`

For V1, keep it server-backed and simple. No need for row expansion yet.

Sorting:

- default sort by `startedAt desc`

Row behavior:

- row click can later open a trip detail page
- for V1 it is acceptable if rows are read-only and non-clickable

## Backend plan

Current server already has:

- `GET /api/trips/mine`
- `GET /api/trips/mine/:tripId`

But `GET /api/trips/mine` currently returns only a minimal summary and does not support date filtering or counts for photos.

Recommended V1 approach:

Add a dedicated user trip overview endpoint rather than overloading the existing minimal mobile-oriented summary.

Recommended endpoint:

- `GET /api/trips/overview`

Query parameters:

- none for `Total`
- or:
  - `from`
  - `to`

Suggested response:

```ts
{
  range: {
    from: string | null;
    to: string | null;
  };
  summary: {
    trips: number;
    waypoints: number;
    photos: number;
  };
  trips: Array<{
    id: string;
    title: string;
    recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
    startedAt: string;
    endedAt: string | null;
    updatedAt: string;
    waypointCount: number;
    photoCount: number;
  }>;
}
```

Implementation detail:

- for `Total`, `range.from` and `range.to` can be `null`
- counts should exclude soft-deleted waypoints and deleted attachments

Business rules:

- only owned trips, not `shared with me`
- filter by `trip.startedAt`
- count photos through `waypoint_attachments`
  - `type = photo`
  - `deleted_at is null`

## Why not reuse `GET /api/trips/mine`

Because `mine` is currently shaped as a compact mobile restore/share endpoint.

Trying to stretch it into:

- richer counts
- optional range filter
- table-oriented web needs

would blur its responsibility.

A separate `overview` endpoint is cleaner.

## Web plan

Relevant existing web files:

- `web/src/app/trips/page.tsx`
- `web/src/sections/trips/view/trips-list-view.tsx`

Relevant existing server files:

- `server/src/trips/trips.controller.ts`
- `server/src/trips/trips.service.ts`

Recommended web structure:

- `web/src/app/trips/page.tsx`
  - route entry
- `web/src/sections/trips/view/trips-list-view.tsx`
  - main client view
- optional small components under:
  - `web/src/sections/trips/components/...`

The view should:

1. load current user
2. redirect unauthenticated user to `/login`
3. redirect admin user to `/dashboard`
4. load trip overview data for active tab

This keeps role routing symmetric:

- admin -> `/dashboard`
- user -> `/trips`

## UI details

### Header

Show:

- page title: `My trips`
- small subtitle like `Server-backed overview of your recorded trips`

### Tabs

Tabs should be:

- `Total`
- `Today`
- `This week`
- `This month`
- `This year`
- `Custom`

### Custom controls

Visible only when `Custom` is active:

- `From`
- `To`

### Summary cards

Keep V1 summary compact:

- `Trips`
- `Waypoints`
- `Photos`

### Table/list

Use a simple MUI table or card-list layout.

Recommendation:

- use a table on web
- it fits the “more columns/details” requirement better than stacked cards

## Testing plan

### Server

Add tests for:

- authenticated user gets only their own trips
- range filter changes both summary and list
- `Total` mode returns unfiltered result
- admin cannot use the user overview endpoint to see someone else’s data

### Web

Add tests for:

- unauthenticated user redirected to `/login`
- admin redirected to `/dashboard`
- user sees default `Total` overview
- changing range tab refetches data
- custom range submits explicit `from` / `to`

## Delivery slices

### Slice 1

Server `GET /api/trips/overview` with:

- auth
- own-trip filtering
- optional range filter
- summary + list response

### Slice 2

Web `/trips` page:

- auth gating
- `Total` default tab
- summary cards
- simple trip table

### Slice 3

Add full date-range tabs and `Custom` support.

### Slice 4

Polish:

- nicer date formatting
- empty states
- loading states
- optional row click to future trip detail

## Out of scope

Not part of this plan:

- shared trips on web
- trip detail page on web
- map rendering on web
- route editing on web
- export/download

## Recommendation

Do this as a dedicated user trip overview, not as a generic “dashboard lite”.

That keeps responsibilities clear:

- `/dashboard` = admin metrics
- `/trips` = user’s own trip history and summary
