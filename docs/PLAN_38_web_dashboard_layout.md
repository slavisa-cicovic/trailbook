# PLAN 38: Web Dashboard Layout

## Goal

Add a real application layout for authenticated web pages in Trailbook.

This layout should provide:

- top header
- left navigation sidebar
- shared page chrome for signed-in pages

It should replace the current “bare page in a container” feeling on:

- `/dashboard`
- `/trips`

## Problem statement

Current Trailbook web pages are structurally incomplete:

- pages render directly inside a `Container`
- there is no persistent navigation
- there is no shared signed-in header
- the app does not yet feel like a real dashboard-style product

Compared to `tms/web`, Trailbook is missing the full dashboard shell layer.

## Product intent

Trailbook web now has at least two signed-in destinations:

- `/dashboard`
  - admin-only metrics
- `/trips`
  - normal user trip overview

These should feel like two pages inside one application, not isolated screens.

## Scope

In scope:

- shared authenticated layout for dashboard-style pages
- left sidebar navigation
- top app header
- role-aware nav visibility

Out of scope:

- complex responsive collapse behavior
- notifications
- language switcher
- profile dialogs/popovers
- advanced breadcrumbs

This is intentionally a minimal first dashboard shell.

## Relevant existing code

Trailbook:

- `web/src/app/layout.tsx`
- `web/src/app/dashboard/page.tsx`
- `web/src/app/trips/page.tsx`
- `web/src/lib/auth-api.ts`

Reference:

- `/home/slavisa/devel/vs_code/tms/web/src/layouts/dashboard/DashboardLayout.tsx`
- `/home/slavisa/devel/vs_code/tms/web/src/app/dashboard/layout.tsx`

## Layout structure

Recommended layout composition:

### Sidebar

Persistent left navigation with:

- app name / logo area
- nav items

Minimal V1 nav:

- `Dashboard`
  - visible only to admin
- `Trips`
  - visible to signed-in users

Optional later:

- `Settings`

### Header

Top header should show:

- current page title or app title
- signed-in user email or display name
- logout action

That is enough for V1.

### Content area

Main scrollable content area where route pages render.

## Routing strategy

Recommended approach:

- introduce a route group for authenticated app pages

Example:

- `web/src/app/(dashboard)/layout.tsx`
- `web/src/app/(dashboard)/dashboard/page.tsx`
- `web/src/app/(dashboard)/trips/page.tsx`

This is cleaner than duplicating wrapper code inside each page.

Important:

- public auth pages stay outside this layout
  - `/login`
  - `/register`
  - `/forgot-password`
  - `/reset-password`

## Auth and role behavior

The layout itself should assume:

- user is already signed in

But because Trailbook currently handles auth client-side, the layout also needs basic defensive behavior:

- if user is not signed in, redirect to `/login`

Role-aware nav rules:

- admin:
  - sees `Dashboard`
  - sees `Trips`
- normal user:
  - does not see `Dashboard`
  - sees `Trips`

Page-level redirects remain:

- admin can visit `/dashboard`
- user visiting `/dashboard` gets redirected to `/trips`

## UI design guidance

This should stay lighter than `tms`.

Recommended V1 visual direction:

- fixed-width sidebar
- sticky top header
- soft borders
- neutral background
- content area with generous padding

Do not copy `tms` complexity:

- no collapse button yet
- no mobile drawer complexity unless necessary
- no grouped admin sections yet

The Trailbook information architecture is still small.

## Component plan

Recommended new files:

- `web/src/layouts/dashboard/trailbook-dashboard-layout.tsx`
- `web/src/layouts/dashboard/trailbook-sidebar.tsx`
- `web/src/layouts/dashboard/trailbook-header.tsx`
- `web/src/app/(dashboard)/layout.tsx`

Route moves:

- `web/src/app/dashboard/page.tsx`
- `web/src/app/trips/page.tsx`

These should move under the dashboard route group so they inherit the shared layout.

## Navigation model

Suggested nav definition:

```ts
[
  { label: "Dashboard", href: "/dashboard", adminOnly: true },
  { label: "Trips", href: "/trips", adminOnly: false },
]
```

No need for nested nav groups yet.

## Header behavior

The header can be simple.

Recommended:

- left:
  - page title
- right:
  - signed-in user label
  - logout button

Optional V1.1:

- small role badge

## Testing plan

### Web

Add tests for:

- signed-in admin sees both nav items
- signed-in user sees only `Trips`
- unauthenticated user is redirected to `/login`
- logout button triggers logout flow

### Manual

Verify:

- `/dashboard` renders inside shared shell
- `/trips` renders inside shared shell
- switching between pages keeps navigation chrome stable

## Delivery slices

### Slice 1

Introduce shared dashboard layout and move routes under it.

### Slice 2

Add role-aware sidebar nav and header user/logout area.

### Slice 3

Polish spacing, sticky behavior, active nav state, page titles.

## Risks

### Risk 1: Route churn

Moving pages into a route group can temporarily break imports or links.

Mitigation:

- keep URLs the same
- only change filesystem route grouping, not public path names

### Risk 2: Client-side auth duplication

If both page and layout fetch current user, we can duplicate work.

Mitigation:

- centralize current-user loading in the layout where possible
- let pages focus on their own data

## Recommendation

Do this now, before adding more web sections.

Without a shared dashboard shell:

- every new page will keep adding local page chrome
- layout debt will spread

With a minimal dashboard layout in place:

- `/dashboard`
- `/trips`
- and future pages

can grow coherently. 
