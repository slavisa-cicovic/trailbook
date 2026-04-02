# AGENTS.md

## Project

This repository contains the full product for **Trailbook**:
- mobile app: React Native
- web app: Next.js + MUI
- backend API: NestJS
- primary platform: iOS
- domain: personal trip logging, route tracking, waypoint/pin capture, offline-first sync

The product records user trips and waypoints locally on mobile, then syncs them to the backend on demand.
Users can later review trips, route maps, distances, and waypoint details on the web.

---

## General rules

- Always understand the existing code before making changes.
- Prefer small, focused, reviewable changes.
- Do not introduce large refactors unless explicitly requested.
- Preserve existing architecture and naming conventions.
- Ask for clarification only when a wrong assumption would likely cause rework.
- When requirements are incomplete, choose the simplest implementation that matches the current architecture.
- Do not add new dependencies unless they are clearly justified.
- Before adding a dependency, explain why it is needed and where it will be used.
- Keep code easy to read and easy to remove or extend later.

---

## Product priorities

When making decisions, optimize for the following order:

1. correctness
2. simplicity
3. offline reliability
4. maintainability
5. performance
6. polish

This is a real product, not a demo.
Prefer robust behavior over clever implementations.

---

## Architecture principles

- Mobile is the primary data capture client.
- Mobile must work offline first.
- Local mobile database is the source of truth until sync succeeds.
- Sync is explicit and user-controlled.
- Backend is the server source of truth after sync.
- Web is mainly for review, browsing, filtering, and map visualization.
- Avoid coupling UI components directly to transport or persistence details.
- Keep domain logic outside UI components whenever possible.

---

## Monorepo structure

Expected top-level apps:

- `mobile/` -> React Native app
- `web/` -> Next.js + MUI app
- `server/` -> NestJS backend
- `docs/` -> plans, architecture, domain notes

If the structure evolves, prefer keeping clear app boundaries.

---

## Technology expectations

### Mobile
- React Native
- TypeScript
- local persistence for trips, location points, and waypoints
- map-based trip visualization
- iOS-first behavior
- route recording should degrade gracefully when background execution is limited by OS behavior

### Web
- Next.js
- TypeScript
- MUI
- clean page/view separation
- map and trip history UI
- strong filtering and readable summaries

### Backend
- NestJS
- TypeScript
- REST API unless explicitly requested otherwise
- clear module boundaries
- DTO validation for all write endpoints

---

## Core domain concepts

Keep naming consistent with the domain.

Main entities likely include:
- User
- Device
- Trip
- TripPoint
- Waypoint
- SyncJob / SyncEvent
- TripStat

### Definitions
- A **Trip** is a user recording session started manually and stopped manually.
- A **TripPoint** is a recorded location sample belonging to a Trip.
- A **Waypoint** is a user-created marker/pin with optional metadata.
- A **TripStat** is an aggregate summary for display and filtering.
- Sync must be designed so repeated sync attempts are safe.

---

## Mobile implementation rules

- Prefer explicit start/stop trip recording.
- Persist important events immediately.
- Never keep important trip state only in memory.
- Treat local database as mandatory, not optional.
- Protect against partial writes and app interruptions.
- Keep background tracking assumptions conservative, especially on iOS.
- Expose recording status clearly in the UI.
- Show when the last point was recorded if relevant.

### Mobile data rules
- Every locally stored entity should be designed with future sync in mind.
- Prefer fields such as:
  - `localId`
  - `serverId` (nullable)
  - `createdAt`
  - `updatedAt`
  - `deletedAt` (nullable if soft delete is used)
  - `syncStatus`

### Mobile UX rules
- User must always know whether recording is active.
- User must be able to stop recording quickly.
- Avoid complex flows during active recording.
- Prefer large, obvious actions on recording screens.

---

## Web implementation rules

- Keep Next.js page files thin.
- Put screen logic in `src/sections/.../view`.
- Prefer reusable MUI components for filters, cards, summaries, and detail panels.
- Optimize for readability over dashboard gimmicks.
- Maps, stats, and trip details should be easy to scan.

### Suggested web page pattern
- `app/.../page.tsx` should mainly render a view component
- main implementation should live under `src/sections/...`

---

## Backend implementation rules

- Organize by feature/module, not by technical layer only.
- Keep controllers thin.
- Put business logic in services.
- Validate all input with DTOs.
- Do not expose persistence models directly as API contracts.
- Design sync endpoints to be idempotent where possible.
- Prefer append-safe and retry-safe sync flows.
- Be explicit about timestamps and timezone handling.
- Store timestamps in UTC.

### API design rules
- Use clear resource naming.
- Prefer predictable REST endpoints.
- Return stable response shapes.
- Do not mix transport DTOs with database entities.
- Add pagination to list endpoints when appropriate.

---

## Mapping and geo rules

- Be conservative with GPS accuracy.
- Do not assume every location sample is trustworthy.
- Filter or flag obviously invalid jumps.
- Keep distance calculations deterministic and testable.
- Separate raw recorded points from derived statistics.
- Do not bury geo logic inside UI components.

---

## Sync rules

- Sync must be explicit and safe to retry.
- Assume the same payload may be sent more than once.
- Avoid destructive sync behavior unless explicitly requested.
- Prefer upsert-style or idempotent server behavior.
- Keep enough metadata to debug sync issues.
- Never delete local data immediately after a server write without clear confirmation of success.

---

## Code style

- Use TypeScript everywhere possible.
- Prefer explicit types on exported APIs.
- Prefer simple functions over deeply abstracted patterns.
- Avoid premature generic abstractions.
- Keep files focused.
- Keep naming domain-oriented and boring.
- Avoid clever shortcuts that reduce readability.

### React / React Native
- Prefer function declarations for exported components.
- Keep components small and composable.
- Extract hooks only when there is real reuse or complexity.
- Keep side effects contained and obvious.
- Do not put heavy business logic directly into JSX components.

---

## Testing expectations

Add or update tests when changing logic that is:
- domain-heavy
- sync-heavy
- geo/distance-related
- parsing/aggregation-related
- easy to break silently

Prioritize tests for:
- trip aggregation
- sync idempotency
- distance calculations
- waypoint creation/update behavior
- filtering and grouping logic

If no tests exist in the touched area yet, do not create an oversized test suite.
Add the smallest useful tests first.

---

## Commands

Before finalizing changes, run the smallest relevant validation for the touched app.

Examples:
- mobile: lint, typecheck, relevant tests
- web: lint, typecheck, relevant tests, build if needed
- server: lint, typecheck, relevant tests

If you cannot run a command, say so explicitly.

---

## Planning and documentation

For non-trivial work:
- create a short plan before editing
- keep the plan concrete
- update the plan if scope changes

Use `docs/` for:
- architecture notes
- implementation plans
- sync design
- domain decisions

Suggested naming:
- `docs/PLAN_01_mvp_foundation.md`
- `docs/PLAN_02_mobile_recording.md`
- `docs/PLAN_03_sync_design.md`

---

## What to avoid

- Do not introduce unnecessary state libraries early.
- Do not over-engineer the first sync version.
- Do not hide core domain rules inside UI code.
- Do not assume background tracking is fully reliable on iOS in every app state.
- Do not mix unfinished experiments into production paths.
- Do not rename large parts of the codebase unless explicitly asked.

---

## When updating this file

Update this file when:
- the same mistake happens more than once
- a recurring review comment appears
- a repo convention becomes stable
- new architectural decisions are confirmed

Keep this file practical and concise.
