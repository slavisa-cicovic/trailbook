# PLAN 69: Viber/WhatsApp Share Experiment

## Goal

Validate whether Trailbook can share a trip through the native OS share sheet in a way that works well for Viber and WhatsApp users, with the recipient opening an interactive public web Trip Details page.

This is an experiment on branch `share-viber-whatsapp-experiment`. The backend owns share tokens and public data access; the web project owns the recipient experience: interactive map, route, waypoints and photos.

## Status

Implemented on `share-viber-whatsapp-experiment`:

- backend trip share token fields;
- backend share PIN hash field;
- authenticated `POST /trips/:clientTripId/share`;
- temporary public `GET /shared/trips/:token` backend HTML stub with OpenGraph metadata;
- PIN-protected public `POST /shared/trips/:token/access` shared trip data endpoint with waypoint image URLs;
- web `/shared/trips/[token]` interactive shared Trip Details page;
- web PIN entry before interactive trip data loads;
- mobile `ShareTripUseCase`;
- mobile Trip Details share action through the native OS share sheet with URL + PIN.

Current experiment direction:

- backend share link points to the web route through `WEB_APP_URL`;
- backend HTML remains only a temporary fallback;
- Viber/WhatsApp validation should now use the web route.

## Constraints

- Sharing must be user-initiated.
- Sharing must not expose trips that are not owned by the current user.
- Sharing requires the trip to be synced first, because recipients need a backend/public URL.
- Public link access must require the generated PIN.
- Do not build app-specific Viber/WhatsApp integrations unless native share sheet proves insufficient.
- Keep the implementation aligned with the current mobile architecture: use-case + repository, not direct API calls from screens.
- Do not build the real interactive recipient UI in Nest string-rendered HTML.

## Phase 1: Backend Share Link

- Add a minimal persisted share state for trips:
  - `share_token`
  - `share_pin_hash`
  - `share_enabled`
  - `shared_at`
- Add `POST /trips/:clientTripId/share`.
- The endpoint must:
  - require authentication;
  - verify the trip belongs to the current user;
  - create/reuse an active share token;
  - return a public share URL.
- Keep revoke optional for this experiment unless implementation is trivial.

## Phase 2: PIN-Protected Public Shared Trip Data Endpoint

- Add a public read-only endpoint such as `POST /shared/trips/:token/access`.
- Require `{ pin }`.
- Store only a PIN hash server-side; return the plain PIN only when the owner creates/regenerates the share link.
- Return a shared-trip payload suitable for web rendering:
  - title;
  - description;
  - started/ended timestamps;
  - distance summary if available;
  - display route points;
  - segments;
  - waypoints;
- waypoint image URLs.
- Return `404` for missing, disabled, or invalid tokens.
- Return `403` for invalid PIN.

The backend may keep `GET /shared/trips/:token` as a temporary HTML stub, but the target architecture is web-owned rendering.

## Phase 3: Web Shared Trip Page

- Add a public web route, for example `/shared/trips/[token]`.
- Show PIN entry first.
- Fetch `POST /api/v1/shared/trips/:token/access` after PIN entry.
- Render an interactive map:
  - route polyline;
  - segment colors;
  - waypoint markers;
  - waypoint photo preview;
  - details panel with title, description and stats.
- Render a responsive layout that is usable when opened from Viber/WhatsApp on mobile.
- Add OpenGraph metadata:
  - trip title;
  - description;
  - first waypoint image when available;
  - fallback Trailbook preview otherwise.

## Phase 4: Mobile Share Use Case

- Add a domain repository method for creating/fetching a share URL.
- Add a `ShareTripUseCase`.
- Implement mobile repository call through the existing authenticated API client.
- Handle network and authorization errors with the existing custom alert flow.
- The share URL should point to the web route, not to a backend JSON endpoint.
- The native share message should include both the URL and PIN.

## Phase 5: Trip Details UI

- Add a share action on `TripDetailScreen`.
- Disable or block share if the trip is not `SYNCED`.
- On tap:
  - request/create share URL from backend;
  - call native `Share.share(...)`;
  - let the OS present Viber, WhatsApp, Messages, etc.
- Do not add Viber/WhatsApp-specific buttons in the first pass.

## Phase 6: Viber/WhatsApp Validation

Test on Android and iOS:

- Share to Viber.
- Share to WhatsApp.
- Confirm recipient sees enough context:
  - app/link title;
  - trip title;
  - useful URL;
  - preview image if available.
- Open the link from recipient device/browser.
- Confirm the recipient lands on the interactive shared-trip web page.

## Decision Criteria

Merge to `main` if:

- native share sheet shows Viber and WhatsApp correctly;
- shared message is understandable without manual editing;
- backend ownership and token checks are correct;
- recipient opens an interactive map/details page;
- waypoint images are visible when present;
- implementation does not add fragile app-specific URL-scheme logic.

Do not merge yet if:

- Viber/WhatsApp preview is poor;
- recipients cannot open an interactive shared trip page;
- implementation requires app-specific hacks;
- share payload is too large or slow.

## Likely Follow-Up

- Add share revoke.
- Add group sharing.
- Add a stable thumbnail strategy for trips without waypoint photos.
- Replace the backend HTML stub with a redirect to the web shared-trip route.
