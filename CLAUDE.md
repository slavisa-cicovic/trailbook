# CLAUDE.md

This file is the operating guide for AI/code agents working in Trailbook.

Trailbook is not a prototype anymore. Treat it as an offline-first mobile recording product with a backend sync path and a small web/admin surface.

## Repository Map

- `mobile/` - Expo / React Native app, TypeScript, SQLite, maps, recording, sync, photos.
- `server/` - NestJS backend, Prisma, PostgreSQL, auth, sync, media metadata.
- `web/` - Next.js + MUI web/admin/review surface.
- `docs/` - implementation plans, architecture decisions, release notes.
- `mobile/modules/trailbook-motion-activity/` - custom Android native module for activity/power-management support.

## Current Priorities

Optimize in this order:

1. Correct trip recording.
2. Data safety.
3. Offline reliability.
4. Observability/debuggability.
5. Maintainability.
6. Performance.
7. UI polish.

Android recording issues are a known hard area. Do not paper over them with ad-hoc UI fixes. Prefer deterministic processing, raw event capture, diagnostics, and tests.

## Working Rules

- Make small, focused, reviewable changes.
- Inspect existing code before changing behavior.
- Do not refactor broad areas unless explicitly requested.
- Do not silently change API payloads, SQLite schema, Prisma schema, sync format, or persisted domain shapes.
- If changing persisted data, update migrations/versioning and mention migration risk.
- Keep business logic out of UI components.
- Prefer deterministic, testable services over screen-level side effects.
- Do not commit unless explicitly asked.

## Planning Rules

Use `docs/PLAN_*.md` for non-trivial work.

Current convention:

- Use numbered plans, for example `docs/PLAN_51_mobile_architecture_hardening.md`.
- For large scopes, split into lettered subplans, for example `PLAN_51A`, `PLAN_51B`, `PLAN_51C`.
- If a subplan needs a follow-up, use suffixes like `PLAN_51A2`.
- Mark implementation status inside the plan when work is completed.
- Keep plans concrete: goal, non-goals, implementation steps, testing, acceptance criteria.

Do not create generic plan names like `PLAN_01_mvp_foundation.md`; this repository already has a mature numbered plan history.

## Roles And Feature Gates

Known roles:

- `user`
- `web_user`
- `test_user`
- `admin`

Rules:

- Test/debug tools must be gated by `test_user`.
- Settings sections such as recording config, data transfer, diagnostics, GPS simulation and support debug info are test-user features.
- Role changes may be refreshed from backend when entering Settings; do not require logout/login for role refresh if a backend check exists.
- Normal users must not see internal debug tools.

## Mobile Architecture

Important current modules:

- `mobile/src/screens/recording/recording-screen.tsx`
- `mobile/src/screens/recording/recording-screen.controller.ts`
- `mobile/src/services/recording/recording-engine.service.ts`
- `mobile/src/services/recording/recording-processor.service.ts`
- `mobile/src/services/recording/auto-recording.service.ts`
- `mobile/src/services/recording/raw-event-reprocessing.service.ts`
- `mobile/src/services/permissions/permission-manager.service.ts`
- `mobile/src/storage/sqlite/db.ts`
- `mobile/src/storage/raw-location-events-storage.ts`
- `mobile/src/storage/diagnostic-events-storage.ts`
- `mobile/src/storage/recording-native-events-storage.ts`

Rules:

- SQLite is the primary local persistence layer for trip data.
- Auth/session/token storage remains outside trip SQLite data.
- Critical recording data must not live only in React state.
- Increment `DATABASE_VERSION` when adding SQLite schema changes.
- `clearLocalTripData` must delete newly added trip-related tables.
- Keep raw location events separate from derived trip points.
- Keep derived stats on `trips` and `trip_segments`, not separate stats tables, unless a future versioning requirement appears.
- Reprocessing should start from raw events and produce deterministic derived points/segments.

## Recording Rules

Current product decision:

- Every AUTO trip starts with a concrete `walk` profile.
- AUTO is a controller/observer over concrete profiles, not a separate sampling profile.
- AUTO should infer profile transitions from raw callback batches before filtering points as the current profile.
- Manual profile switching exists mainly for testing and may be removed later.
- Foreground UI may observe/display location, but recording writes and profile transitions must go through the recording pipeline, not ad-hoc screen writes.
- Background/native delivery can batch events, especially on Android. Batch processing must be order-aware and deterministic.
- Keep raw events so bad processing can be reprocessed after logic fixes.

Known Android constraints:

- Android may delay or batch background location callbacks.
- Battery optimization can reduce or stop delivery.
- Permission state must be verified explicitly, especially `ACCESS_BACKGROUND_LOCATION`.
- App behavior in Expo Go can differ from release APK behavior.
- Do not assume iOS behavior proves Android behavior.

## Permissions

Permissions must be handled centrally.

Primary service:

- `mobile/src/services/permissions/permission-manager.service.ts`

Rules:

- Do not scatter permission request logic across screens/services.
- Config files still own declarations: `mobile/app.config.js`, `mobile/android/app/src/main/AndroidManifest.xml`, iOS plist config.
- Recording must be disabled if required permissions are missing.
- If permissions are missing, Recording screen should show a clear warning and a single action to run permission setup.
- Camera/photo flows should rely on PermissionManager status and should not independently create divergent permission behavior.

## Sync Rules

- Sync must be explicit and retry-safe.
- Repeated sync must not create duplicates.
- Sync should include enough derived snapshots that backend does not recompute mobile-derived stats.
- Raw events may currently be synced because this is still an internal/test phase and they are required for debugging/reprocessing.
- Soft deletes and `syncStatus` transitions must stay consistent.
- If editing sync, think about idempotency first.

## Media Rules

- Waypoint photos are stored locally for offline use and uploaded/restored through sync.
- Server stores metadata and file references, not photo blobs in PostgreSQL.
- Restore from backend should download photos so offline viewing works.
- iOS upgrades can invalidate local file paths; photo URI resolution must be defensive.
- Do not silently lose local photos during migration or restore.

## Diagnostics And Support

Current observability pieces:

- `SupportBundleV1` in `mobile/src/services/support/support-bundle.service.ts`
- token scrubber in `mobile/src/services/support/support-bundle-scrubber.service.ts`
- normalized diagnostic events in `mobile/src/storage/diagnostic-events-storage.ts`
- recording native events in `mobile/src/storage/recording-native-events-storage.ts`
- raw location event summaries in `mobile/src/storage/raw-location-events-storage.ts`

Rules:

- Support bundles must never include session tokens, refresh tokens, passwords, cookies or authorization headers.
- Support bundles may include route/coordinate diagnostics for `test_user`.
- Error boundaries should record diagnostic events.
- If adding a new diagnostic table or event category, include it in support bundle only if it helps field debugging.
- Crash reporting is currently deferred; before wider beta, decide and configure Sentry or an equivalent with PII/token scrubbing.

## Backend Rules

Backend responsibilities:

- Auth/session issuance.
- Role and entitlement enforcement.
- Sync receive/restore.
- Sharing authorization.
- Media metadata and download/upload authorization.

Rules:

- Keep controllers thin.
- Keep business logic in services.
- Validate DTOs for writes.
- Do not expose Prisma models directly as API contracts.
- If editing Prisma schema, run/give the correct `prisma db push` or migration path.
- Prisma enum values cannot contain hyphens; use names like `test_user`.

## Web Rules

The web app is secondary to mobile.

Rules:

- Keep pages thin.
- Prefer simple review/admin workflows over dashboard complexity.
- Do not couple web access to mobile billing assumptions without backend entitlements.
- Web-only features must still respect backend authorization.

## Commands

Use the smallest relevant validation.

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

Android native/release checks:

```bash
cd mobile/android
./gradlew assembleRelease -Dorg.gradle.java.home=/usr/lib/jvm/java-17-openjdk
./gradlew :trailbook-motion-activity:compileReleaseKotlin -Dorg.gradle.java.home=/usr/lib/jvm/java-17-openjdk
```

Repository-wide:

```bash
npm run typecheck
npm run lint
```

If a command cannot be run, say exactly why.

## Testing Focus

Prioritize tests for:

- recording processor and batch behavior
- AUTO profile transitions
- raw event reprocessing
- trip stats and segment stats
- sync idempotency
- permission manager behavior
- support bundle token scrubbing
- media restore/photo URI handling
- trip groups and selection behavior

Avoid huge broad tests when a small focused test covers the risk.

## High-Risk Areas

Be careful when touching:

- recording lifecycle
- background location service start/stop/restart
- AUTO profile detection
- raw event persistence/reprocessing
- SQLite schema and migrations
- sync payloads and restore behavior
- permissions
- photo storage/restore
- role/feature-gate logic
- Prisma schema

For these areas, state the risk and validate with typecheck/tests or a targeted manual check.

## Release Readiness

Release checklist:

- `docs/RELEASE_READINESS.md`

Rules:

- Keep each release item status-based: `todo`, `in_progress`, `done`, `not_applicable`.
- Sentry/crash reporting is deferred during internal testing but is a blocker before wider beta.
- SQLite encryption remains a pre-release security decision.
- Maps keys, production API URL, permissions copy and debug gates must be verified before store builds.

## What To Avoid

- Do not store secrets in the repository.
- Do not hardcode personal credentials in committed code.
- Do not add hidden recording paths outside the recording engine.
- Do not add another permission flow outside PermissionManager.
- Do not delete raw events unless there is an explicit retention policy.
- Do not silently recompute backend stats that mobile already produced.
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
