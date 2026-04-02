# Trailbook

Trailbook is a monorepo for a trip logging product with three main apps:

- `mobile/` -> React Native mobile app
- `web/` -> Next.js + MUI web app
- `server/` -> NestJS backend API
- `docs/` -> plans, architecture, and domain notes

## Product focus

Trailbook is built for personal trip logging, route tracking, waypoint capture, and offline-first sync.

Core principles:

- mobile is the primary data capture client
- mobile works offline first
- sync is explicit and safe to retry
- backend becomes the server source of truth after successful sync
- web is used for review, browsing, filtering, and map visualization

## Repository status

The repository is currently initialized with the expected top-level app structure.
Implementation scaffolding for individual apps has started with a minimal foundation.

## Current foundation

- root npm workspaces for `mobile`, `web`, and `server`
- minimal TypeScript configuration per app
- mobile domain and local storage shape placeholders
- web page and view separation for trip history review
- server feature layout with DTO and service/controller boundaries

## Notes

- framework runtime dependencies are intentionally not installed yet
- the current scaffold defines boundaries and naming, not production-ready app bootstrap
- the next implementation steps should follow `docs/PLAN_02_mobile_recording.md` and `docs/PLAN_03_sync_design.md`
