# PLAN 35: Web Admin Dashboard

## Goal

Add an admin-only dashboard on the web app that shows core product usage metrics over a selectable time range.

The dashboard should answer:

- How many users exist in total?
- How many users are new in the selected period?
- How many trips were created in the selected period?
- What is the average number of trip points per trip in the selected period?
- How many photos were created in the selected period?
- What is the total uploaded photo size in the selected period, shown in MB or GB?

## Product scope

This page is visible only to users with role `admin`.

Non-admin authenticated users should not see admin metrics. They should either:

- be redirected away from `/dashboard` to a normal user page such as `/trips`, or
- see a lightweight “Admin access required” state.

For V1, redirecting non-admin users to `/trips` is the cleaner product choice.

## Time range model

The dashboard supports these range presets:

- Today
- This week
- This month
- This year
- Custom

`Custom` means the user picks:

- `from`
- `to`

The backend should receive explicit ISO timestamps, not vague labels. The web layer can translate presets into concrete ranges.

Recommended convention:

- all range boundaries computed in the app using the user/browser local timezone
- backend receives `from` and `to`
- backend applies `createdAt >= from` and `createdAt < to`

This avoids ambiguity and keeps the API simple.

## Page organization

Tabs are a good fit here, but tabs should represent date ranges, not metric domains.

Recommended V1 tab layout:

1. `Today`
2. `This week`
3. `This month`
4. `This year`
5. `Custom`

Each tab shows the same metric content:

- total users
- new users in the tab range
- trips created in the tab range
- average trip points per trip in the tab range
- photos created in the tab range
- total photo size in the tab range

`Custom` is the only tab that exposes explicit `from` / `to` date inputs.

This is the right fit for the product question you asked:

- same dashboard content
- different time windows
- quick switching without rebuilding the page mentally

## V1 metrics definition

### Dashboard content for every tab

Show the same KPI cards in every tab:

- `Total users`
  - total count of rows in `users`
- `New users`
  - count of rows in `users` whose `created_at` falls in selected range
- `Trips created`
  - count of rows in `trips` whose `created_at` falls in selected range
- `Avg trip points / trip`
  - `trip_points created in selected trips / number of selected trips`
  - calculated only for trips created in selected range
- `Photos created`
  - count of `waypoint_attachments` with type `photo`, `deleted_at is null`, and `created_at` in selected range
- `Photo storage`
  - sum of `file_size_bytes` for those same photo attachments

Important business rules for V1:

- trip activity is based on `trips.created_at`, not `updated_at`
- photo activity is based on `waypoint_attachments.created_at`
- photos count only when:
  - `waypoint_attachments.type = photo`
  - `deleted_at is null`

## Data sources

Relevant existing tables/models:

- `server/prisma/schema.prisma`
  - `User`
  - `Trip`
  - `TripPoint`
  - `WaypointAttachment`

Relevant existing web entry points:

- `web/src/app/dashboard/page.tsx`
- `web/src/components/auth/dashboard-auth-panel.tsx`
- `web/src/lib/auth-api.ts`

Relevant existing server modules:

- `server/src/auth/auth.service.ts`
- `server/src/users/users.service.ts`
- `server/src/trips/trips.service.ts`
- `server/src/trips/trips.controller.ts`

## Backend plan

Add a dedicated admin dashboard endpoint rather than trying to reuse `users` or `trips` endpoints.

Recommended endpoint:

- `GET /api/admin/dashboard?from=...&to=...`

Response shape:

```ts
{
  range: {
    from: string;
    to: string;
  };
  overview: {
    totalUsers: number;
    newUsers: number;
    tripsCreated: number;
    totalTripPoints: number;
    averageTripPointsPerTrip: number;
    photosCreated: number;
    totalPhotoBytes: number;
  };
}
```

V1 still does not need separate endpoints per tab. One aggregate payload per selected range is enough.

Implementation notes:

- add a small `admin` module or `admin-dashboard` module on server
- require authenticated user
- require `role === admin`
- reject non-admin with `403`
- compute metrics via Prisma aggregate/count queries

Important detail:

- `averageTripPointsPerTrip` must not divide by zero
- return `0` when there are no trips in the selected range

## Web plan

Replace the current auth-only placeholder dashboard with a real admin dashboard shell.

Recommended structure:

- `web/src/app/dashboard/page.tsx`
  - route entry
- `web/src/sections/dashboard/view/admin-dashboard-view.tsx`
  - main client view
- `web/src/sections/dashboard/components/...`
  - KPI cards
  - date-range tabs
  - custom range inputs

`DashboardAuthPanel` should stop being the main dashboard body. Its current responsibility can be reduced to auth/user fallback behavior or removed from this route.

Recommended web flow:

1. load current user
2. if not signed in, redirect to `/login`
3. if signed in but not admin, redirect to `/trips`
4. if admin, load dashboard metrics for default tab

Default selected tab:

- `This month`

That is still the most useful default.

## UI plan

### Header area

Show:

- page title: `Admin dashboard`
- date-range tabs
- custom date inputs only when `Custom` is active

### Tab content layout

Use one responsive card grid reused by every tab.

Suggested cards for every tab:

- `Total users`
- `New users`
- `Trips created`
- `Avg trip points / trip`
- `Photos created`
- `Photo storage`

Formatting rules:

- counts shown as integers
- bytes formatted automatically to `MB` or `GB`
- averages shown with one decimal place when needed

No charts are required for V1.

## Access control plan

The route must be protected both:

- in the UI
- on the API

UI protection alone is not enough.

Server endpoint must validate:

- authenticated user exists
- user role is `admin`

## Testing plan

### Server

Add tests for:

- admin can fetch dashboard metrics
- non-admin gets `403`
- range filter changes counts correctly
- zero-trip range returns `averageTripPointsPerTrip = 0`

### Web

Add tests for:

- unauthenticated user sees login redirect/fallback
- non-admin user is redirected away from dashboard
- admin dashboard loads default range
- changing preset triggers refetch
- custom range submits explicit `from/to`

## Delivery slices

### Slice 1

Server aggregate endpoint with admin guard.

### Slice 2

Web dashboard route with:

- auth gating
- default `This month` tab
- KPI cards for one selected range

### Slice 3

Add full tab switching:

- `Today`
- `This week`
- `This month`
- `This year`
- `Custom`

### Slice 4

Polish:

- loading states
- empty states
- byte formatting
- better date-range UX

## Out of scope

Not part of this plan:

- charts
- CSV export
- per-user drilldown tables
- trip sharing analytics
- attachment MIME breakdown beyond photos
- subscription/revenue analytics

## Recommendation

Implement this as an `admin dashboard`, not as a general dashboard for every signed-in user.

The current `/dashboard` route already exists, so the cleanest evolution is:

- admins keep using `/dashboard`
- non-admins get redirected to `/trips`

That keeps routing simple and avoids introducing a second dashboard concept too early.
