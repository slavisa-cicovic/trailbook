# PLAN 01: MVP Foundation

## Goal

Establish the smallest useful product foundation for Trailbook so the repository can grow into a real offline-first trip logging system without early architectural churn.

This plan focuses on:

- monorepo app setup
- shared domain vocabulary
- first end-to-end MVP boundaries
- implementation order for the first vertical slice

## Product outcome

At the end of this plan, the project should support a narrow but coherent MVP path:

1. user starts a trip on mobile
2. mobile records trip data locally
3. user stops the trip
4. user manually triggers sync
5. backend accepts the payload safely
6. web can list and review synced trips

## MVP scope

Included in MVP foundation:

- repository structure for `mobile/`, `web/`, `server/`, and `docs/`
- initial app scaffolding for each app
- basic domain model for `Trip`, `TripPoint`, `Waypoint`, and sync metadata
- explicit offline-first mobile storage design
- first manual sync flow design
- minimal backend API shape for trip sync and trip listing
- minimal web read-only trip history view

Explicitly out of scope for this phase:

- background tracking optimization beyond conservative iOS-safe assumptions
- advanced map rendering and route styling
- sharing, social, or collaboration features
- complex authentication and multi-device conflict resolution
- analytics, achievements, and dashboard polish
- generalized abstraction layers that are not yet justified

## Working assumptions

- mobile is the primary product surface
- iOS is the primary target platform
- local mobile persistence is mandatory
- sync is manual and retry-safe
- backend stores timestamps in UTC
- web is read-oriented in the first version

## Foundation decisions

### 1. Monorepo boundaries

Keep clear app ownership:

- `mobile/` owns recording, local persistence, sync initiation, and mobile UX
- `server/` owns validation, sync ingestion, canonical persistence, and read APIs
- `web/` owns browsing, filtering, and review UI
- `docs/` owns plans, architecture notes, and domain decisions

### 2. Domain naming

Use the domain terms from `AGENT.md` consistently:

- `Trip`
- `TripPoint`
- `Waypoint`
- `TripStat`
- `SyncJob` or `SyncEvent`

Avoid inventing alternate names for the same concept.

### 3. MVP sync strategy

The first sync version should be simple:

- manual user-triggered sync only
- idempotent or append-safe server handling
- per-entity sync metadata on mobile
- no destructive local cleanup immediately after upload
- enough metadata to inspect failures later

### 4. UI strategy

Keep the first UI narrow and obvious:

- mobile prioritizes recording state clarity and large actions
- web prioritizes readable trip lists and trip detail summaries
- map-heavy polish is deferred until core data flow is stable

## Proposed implementation order

### Phase 1: Repository and app bootstrap

- initialize minimal app scaffolds inside `mobile/`, `web/`, and `server/`
- add TypeScript configuration per app
- establish lint/typecheck scripts
- keep each app runnable with minimal placeholder screens/routes

Exit criteria:

- each app can install and start independently
- each app has a minimal README or script entrypoint
- no unnecessary dependencies are introduced

### Phase 2: Shared domain shape

- define first-pass domain entities per app boundary
- document required fields for mobile-local entities
- align transport DTOs separately from persistence models
- define timestamp and sync status conventions

Exit criteria:

- `Trip`, `TripPoint`, and `Waypoint` fields are explicitly documented
- server DTO boundaries are clear
- mobile local entity shape is designed for future sync

### Phase 3: Mobile local-first recording slice

- implement explicit trip start/stop flow
- persist trip session state locally
- persist trip points locally
- persist waypoint creation locally if included in the first slice
- expose current recording state clearly in UI

Exit criteria:

- important trip state survives app interruption
- no critical recording state exists only in memory
- user can see whether recording is active

### Phase 4: Server sync ingestion slice

- create minimal sync endpoint(s)
- validate all write payloads with DTOs
- store synced trip data in normalized server-side structures
- make repeated sync attempts safe

Exit criteria:

- sync request can be retried without corrupting server state
- invalid payloads are rejected predictably
- timestamps are stored in UTC

### Phase 5: Web review slice

- add trip list page
- add basic trip detail view
- show summary information that is easy to scan
- keep Next.js page files thin and move view logic into `src/sections/.../view`

Exit criteria:

- a synced trip can be found on the web
- a trip summary is readable without map polish
- page/view separation follows repo rules

## Initial data model notes

### Trip

Suggested MVP fields:

- `localId`
- `serverId`
- `deviceId`
- `userId`
- `startedAt`
- `endedAt`
- `createdAt`
- `updatedAt`
- `syncStatus`

### TripPoint

Suggested MVP fields:

- `localId`
- `serverId`
- `tripLocalId` or `tripServerId`
- `latitude`
- `longitude`
- `recordedAt`
- `accuracy`
- `altitude` if available
- `speed` if available
- `syncStatus`

### Waypoint

Suggested MVP fields:

- `localId`
- `serverId`
- `tripLocalId` or `tripServerId`
- `latitude`
- `longitude`
- `title`
- `note`
- `createdAt`
- `updatedAt`
- `syncStatus`

## Risks

- background location behavior on iOS may be less reliable than expected
- premature sync complexity can slow delivery
- blurred boundaries between UI, domain logic, and persistence can create churn
- map features can consume time before the core recording/sync path is stable

## Validation approach

For this phase, validate the smallest useful surface:

- repo structure is stable and intentional
- app scaffolds typecheck
- first recording/sync logic gets focused tests where breakage risk is high
- geo, aggregation, and sync logic are tested before UI polish

## Next plans

This document should be followed by:

- `docs/PLAN_02_mobile_recording.md`
- `docs/PLAN_03_sync_design.md`

Those plans should go deeper into implementation details after the foundation choices here are accepted.
