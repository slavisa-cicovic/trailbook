# CLAUDE.md

This file is the operating guide for AI/code agents working in Trailbook.

Trailbook is an offline-first mobile trip-recording app with a backend sync path
and a small web surface. The mobile app was fully rearchitected (based on the
Vellora design) to fix fundamental issues with geolocation tracking and processing.
The new architecture is in effect across all three packages.

## Repository Map

- `mobile/` — Expo / React Native app, TypeScript, Drizzle + SQLite, maps, recording, sync, photos.
- `server/` — NestJS backend, Prisma, PostgreSQL, auth, raw-bundle storage, media upload.
- `web/` — Next.js + MUI web/admin surface.
- `docs/` — implementation plans (`PLAN_NN_*.md`), architecture decisions.

## Current Priorities

Optimize in this order:

1. Correct trip recording.
2. Data safety.
3. Offline reliability.
4. Observability/debuggability.
5. Maintainability.
6. Performance.
7. UI polish.

Android recording reliability is a known hard area. Do not paper over issues with
ad-hoc UI fixes. Prefer deterministic processing, raw event capture, and tests.

## Working Rules

- Make small, focused, reviewable changes.
- Inspect existing code before changing behavior.
- Do not refactor broad areas unless explicitly requested.
- Do not silently change API payloads, SQLite/Drizzle schema, Prisma schema, sync
  format, or persisted domain shapes.
- If changing persisted data, update Drizzle migrations and mention migration risk.
- Keep business logic out of screens and stores.
- Prefer deterministic, testable use-cases/repositories over screen-level side effects.
- Do not commit unless explicitly asked.

## Planning Rules

Use `docs/PLAN_*.md` for non-trivial work. Next plan number is **66**.

> **Warning:** The app went through a complete rearchitecture (PLAN_67) that replaced
> the entire old mobile core. The plans remaining in `docs/` describe future features
> but were written against the old architecture. Before implementing any plan, verify
> that its assumptions, module references, and file paths still hold against the actual
> code. Trust the code and this CLAUDE.md — not the plan description.

Conventions:

- Numbered plans: `docs/PLAN_21_short_description.md`.
- Large scopes: lettered subplans `PLAN_21A`, `PLAN_21B`, etc.
- Subplan follow-ups: `PLAN_21A2`.
- Mark implementation status inside the plan when work is completed.
- Keep plans concrete: goal, non-goals, steps, testing, acceptance criteria.
- All plan files, CLAUDE.md files, and AGENT.md files must be written in English.

## Tech Stack

| Concern | Choice |
|---------|--------|
| Mobile framework | Expo managed workflow + EAS Build |
| Navigation | Expo Router (file-based) |
| Local DB | expo-sqlite v16 + Drizzle ORM |
| State | Zustand (one store per feature) |
| Background location | expo-location + expo-task-manager |
| Maps | react-native-maps |
| HTTP | Native fetch + typed wrappers |
| Auth storage | expo-secure-store |
| Camera / Gallery | expo-image-picker |
| Backend | NestJS + Prisma + PostgreSQL |
| Object storage | S3-compatible (MinIO local, AWS S3 prod) |
| Web | Next.js + MUI |

## Data Model — Three Layers

The data splits into three layers with different lifecycles. Do not blur them.

- **RAW** — everything the OS gives during recording. Immutable, append-only,
  lossless. The single source of truth for reprocessing. Processing never edits it.
- **DERIVED** — segments and cleaned path. A pure function of RAW + `CaptureMeta`
  + `processingVersion`. Fully regenerable; reprocessing deletes and rebuilds it.
- **AUTHORED** — user input (trip title/description, waypoints, images). Never
  derived; reprocessing must not touch it.

Key domain types (see `mobile/src/core/domain/model/`):

```typescript
// AUTHORED
type TripStatus = 'RECORDING' | 'PAUSED' | 'COMPLETED';
type SyncState  = 'PENDING'   | 'SYNCED' | 'FAILED';

interface Trip {
  id: number;               // local Drizzle id (on-device only)
  clientTripId: string;     // UUID generated on device; idempotency key for upload
  title: string;
  description: string | null;
  startedAt: Date;
  endedAt: Date | null;     // null while recording
  status: TripStatus;
  processingVersion: number;
  syncState: SyncState;
}

// DERIVED
type SegmentType = 'WALK' | 'BIKE' | 'DRIVE' | 'BOAT' | 'PLANE' | 'STATIONARY' | 'UNKNOWN';

// RAW context — must be persisted so pipeline is deterministic across devices
interface CaptureMeta {
  tripId: string;
  captureSchemaVersion: number;
  appVersion: string;
  osApiLevel: number;
  deviceModel: string;
  captureTimeZone: string;  // IANA tz AT CAPTURE — pipeline uses this, never the live tz
}

type SessionEventType =
  | 'RECORDING_STARTED' | 'RECORDING_STOPPED'
  | 'RECORDING_PAUSED'  | 'RECORDING_RESUMED' | 'TRIP_RESUMED'
  | 'SERVICE_RESTARTED' | 'PROCESS_DEATH_RECOVERED'
  | 'PERMISSION_CHANGED' | 'LOCATION_SETTINGS_CHANGED';
```

Notes:
- `SegmentType` ≠ raw OS activity. The OS emits `IN_VEHICLE / ON_BICYCLE / ON_FOOT /
  WALKING / RUNNING / STILL / TILTING / UNKNOWN`. BOAT and PLANE are inferred by the
  pipeline from activity + speed. Store raw activity verbatim; emit `SegmentType` only
  as DERIVED output.
- `duration` is derived (`endedAt - startedAt`); never stored.
- Timestamps: `Date` in domain; ISO-8601 strings in DTOs and Drizzle columns.
- `Result<T>` from `@/core/common/result` for all fallible operations.
- Path alias: `@/` → `src/`.

## Mobile Folder Structure

```
app/                          # Expo Router screens
src/
  core/
    auth/                     # AuthRepository interface + SecureStore impl
    common/                   # Result<T>, uuid, constants
    data/
      activity/               # Speed-derived activity sampler
      devicestate/            # Battery/power-save/GPS state sampler
      local/                  # DAOs (trip, waypoint, waypointImage, rawLocation,
      |                       #   rawActivity, rawDevice, rawSessionEvent, segment,
      |                       #   captureMeta)
      location/               # locationTask (expo-task-manager), activeTripStore
      remote/                 # apiClient, dto/tripBundleDto, FetchRemoteTripDataSource,
      |                       #   FetchRemoteWaypointImageDataSource
      repository/             # TripRepositoryImpl, RawCaptureRepositoryImpl
      sync/                   # syncTask (background upload)
    db/                       # Drizzle schema, migrations, db singleton, dbEvents
    domain/
      model/                  # Plain TS types (trip, segment, waypoint, rawSamples, tripBundle)
      processing/             # Pure pipeline: process(bundle, version) → Segment[]
      usecase/                # Use-case interfaces + implementations
  feature/
    auth/                     # authStore
    recording/                # recordingStore, components
    trips/                    # tripsStore, tripDetailStore, components
    waypoint/                 # waypointDetailStore, components
    settings/                 # settingsStore, themeStore
  components/                 # Shared layout + UI components
  constants/                  # Theme, segment colors
  hooks/                      # App-level hooks (e.g. useAppTheme)
```

## Processing Pipeline — The Critical Invariant

The whole point of the RAW layer: a trip can be reprocessed on any device so that
fixing the code fixes all trips, without re-walking a route.

**Invariant (do not break):** processing output is a pure function of
`(RAW bundle + CaptureMeta + processingVersion)` and nothing else.

The pipeline (`core/domain/processing/pipeline.ts`) must NOT read:
- the live system clock
- the current time zone or locale
- live sensors or OS APIs
- the network
- randomness

Anything it needs about capture conditions comes from `CaptureMeta`. This is what
guarantees the same bundle yields the same segments on any device.

Rules:
- `process(bundle, version): Segment[]` — pure, side-effect-free.
- `CURRENT_PROCESSING_VERSION` lives in `pipeline.ts`; bump it when the algorithm
  changes in a way that can produce different output for the same RAW.
- Reprocessing = load RAW for `clientTripId` → run pipeline at current version →
  replace DERIVED segments → update `Trip.processingVersion`. RAW and AUTHORED untouched.
- The RAW bundle is the test-fixture format. Pull a bundle (`GET /trips/:clientTripId`),
  drop it in test resources, write a failing test, fix pipeline, go green, reprocess.

## Location Recording Rules

- Recording uses `expo-location` `startLocationUpdatesAsync` with a **foreground
  service** configuration. The service writes **RAW samples only** via DAOs: location,
  speed-derived activity, device state, and session events.
- The location task (`core/data/location/locationTask.ts`) writes to SQLite and emits
  `dbEvents` for reactive UI updates.
- Processing runs on-device from RAW, not inline in the task. The UI observes stores
  which read from the DB — it never reads locations directly.
- `activeTripStore.ts` holds the in-memory `clientTripId` for the running recording
  session so the background task knows which trip to write to.
- Batch delivery can occur on Android. The task processes each location in order.
- App behavior in Expo Go can differ from a release APK. Do not assume iOS behavior
  proves Android behavior.

## Permissions

Declared and requested at runtime:
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION` — currently declared in the manifest; this adds extra
  Play Store review. Revisit before store submission: if recording is always
  user-initiated from the foreground, the foreground service covers background + screen-
  off without this permission.
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` (Android 14+)
- `POST_NOTIFICATIONS` (Android 13+)
- `ACTIVITY_RECOGNITION` (Android 10+, for future full activity detection)
- `CAMERA` (waypoint photos taken in-app)
- `INTERNET`

Rules:
- Permission request logic must not be scattered across screens. Keep it close to the
  feature that needs it and clearly gated.
- Recording screen must show a clear warning and a single action if required permissions
  are missing.
- Never crash or silently no-op on denied permissions.
- Config files own declarations: `mobile/app.config.js` and
  `mobile/android/app/src/main/AndroidManifest.xml`.

## Sync Rules

- The **backend is a lossless RAW store**, not a processor. It stores the full
  `TripBundle` as `jsonb` and serves it back unchanged.
- Upload unit is `TripBundle`: `{ trip, captureMeta, raw: { locations, activities,
  devices, events }, waypoints, segments? }`. DERIVED segments may be included as a
  display cache but are never the source of truth.
- **Idempotent on `clientTripId`**: repeated upload of the same trip is a no-op on
  the server. Sync must never create duplicates.
- `syncState` transitions: `PENDING → SYNCED` on success; `PENDING → FAILED` on
  permanent error (manual retry). Only `TripRepositoryImpl` flips `syncState`.
- Waypoint images upload separately via object storage (not inside the bundle).
  `WaypointImage.uploadState`: `PENDING | UPLOADED | FAILED`. `objectKey` is the
  S3 object key stored after successful upload.
- Sync runs via `core/data/sync/syncTask.ts`.
- Do not silently recompute on the backend stats that mobile already produced.
- If editing sync, think about idempotency first.

## Media Rules

- Waypoint photos are stored locally (file URI) and uploaded to object storage.
- Room (`waypointImages` table) stores only the URI + `objectKey` + `uploadState`.
- Restore from backend should download photos so offline viewing works.
- Local file paths can be invalidated (e.g. iOS app reinstall). URI resolution must
  be defensive.
- Do not silently lose local photos during migration or restore.

## Backend Rules

NestJS + Prisma + PostgreSQL. The server's primary job:
- Auth/session issuance and refresh token management.
- Receiving and losslessly storing `TripBundle` (raw `jsonb`).
- Serving bundles back by `clientTripId` for restore and the reprocessing debug loop.
- Pre-signed URL issuance for waypoint image upload/download (object storage).

Rules:
- Keep controllers thin; keep business logic in services.
- Validate DTOs for all writes.
- Do not expose Prisma models directly as API response types.
- If editing Prisma schema: run `npm run prisma:push --workspace server` and document
  migration risk.
- `rawBundle` is stored as `jsonb` — do not normalize or process its contents.
- The backend does NOT reprocess trips or derive segments.

## Roles

Known roles:
- `user`
- `web_user`
- `test_user`
- `admin`

Rules:
- Test/debug tools and diagnostic features must be gated by `test_user`.
- Normal users must not see internal debug tools.
- Role changes may be refreshed from backend when entering Settings; do not require
  logout/login for role refresh if a backend check exists.

## Web Rules

The web app is secondary to mobile.

Rules:
- Keep pages thin.
- Prefer simple trip review/admin workflows over dashboard complexity.
- Web-only features must still respect backend authorization.

## Commands

Mobile:

```bash
npm run typecheck --workspace mobile
npm test --workspace mobile
npm run lint --workspace mobile
```

Server:

```bash
npm run typecheck --workspace server
npm test --workspace server
npm run prisma:push --workspace server
```

Android release build:

```bash
cd mobile/android
./gradlew assembleRelease -Dorg.gradle.java.home=/usr/lib/jvm/java-21-openjdk
```

Repository-wide:

```bash
npm run typecheck
npm run lint
```

If a command cannot be run, say exactly why.

## Testing Focus

Prioritize tests for:

- processing pipeline correctness (golden fixtures: real RAW bundles → expected segments)
- pipeline determinism: same bundle + version → same output every time
- `ReprocessTripUseCase` behavior (RAW and AUTHORED untouched, only DERIVED replaced)
- sync idempotency (`clientTripId` deduplication)
- `TripRepositoryImpl` and `RawCaptureRepositoryImpl`
- `UploadTripUseCase` and `UploadWaypointImagesUseCase`
- Drizzle schema migrations
- photo URI handling and restore

Avoid huge broad tests when a small focused test covers the risk.

## High-Risk Areas

Be careful when touching:

- `core/domain/processing/` — any change here can silently alter segment output for
  all existing trips; bump `CURRENT_PROCESSING_VERSION` if output can change
- `core/db/schema.ts` and `core/db/migrations/` — schema changes require a new
  migration; verify with existing data
- `core/data/location/locationTask.ts` — background task; failures here lose
  raw data silently
- `core/data/location/activeTripStore.ts` — if this loses the active trip ID,
  the background task writes nothing
- sync payload shape and `TripBundle` DTO — changing the wire format breaks
  round-trip restore
- Prisma schema — if editing, provide the correct `prisma db push` path
- photo upload/restore flow — silent failures lose user data
- `clientTripId` idempotency — any change risks duplicates on the server

For these areas, state the risk and validate with typecheck/tests or a targeted
manual check before marking work done.

## What To Avoid

- Do not store secrets in the repository.
- Do not hardcode credentials in committed code.
- Do not write business logic in Expo Router screens or Zustand stores — screens
  render state, stores expose state; logic lives in use cases and repositories.
- Do not let the location task do anything other than write RAW samples and emit
  `dbEvents`. No derivation, no processing, no UI side effects.
- Do not add a second recording path outside `locationTask` + `RawCaptureRepository`.
- Do not modify RAW or AUTHORED data during reprocessing.
- Do not silently drop RAW fields in the bundle DTO — future pipeline code may need them.
- Do not make Android assumptions based only on iOS tests.
- Do not expose test-user tools to normal users.

## When To Update This File

Update this file when:

- a convention becomes stable
- the same mistake happens more than once
- architecture direction changes materially
- a new plan series introduces a durable rule
- a command or validation flow changes

Keep this document practical and current.
