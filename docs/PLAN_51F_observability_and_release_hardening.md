# PLAN 51F: Observability And Release Hardening

## Goal

Make field debugging and production readiness explicit parts of the mobile architecture.

This plan does not try to fix Android recording directly. Its goal is to make every production problem diagnosable enough that we can distinguish:

- OS/native location delivery problems
- JS/background task delivery problems
- recording processor/filtering bugs
- sync/outbox failures
- permission/capability problems
- media restore/storage problems

## Current State

The app already has partial building blocks:

- support bundle export
- diagnostics tables
- raw location events
- test-user feature gates
- error boundary scaffolding
- release readiness document

The missing part is consistency. Diagnostics, crash reporting, support bundle, release checklist and privacy decisions should be treated as one system.

## Non-Goals

- Do not implement the Android native watchdog here. That is covered by `PLAN_51E_android_native_recording_watchdog.md`.
- Do not migrate sync to outbox here. That is covered by `PLAN_51D_sync_outbox_full_migration.md`.
- Do not rewrite recording processor logic here. That is covered by `PLAN_51B_deterministic_recording_processor.md`.
- Do not add analytics unless there is a concrete product need.

## Observability Model

### Event Categories

Use stable event categories so logs, diagnostics and support bundle can be correlated:

- `app`: startup, hydration, app state changes, fatal errors
- `permissions`: current status, setup flow, denied/missing capabilities
- `recording`: start, stop, pause, resume, profile transition, segment mutation
- `location`: native callback summary, JS callback summary, accepted/rejected decision
- `raw_events`: insert count, dedupe count, batch summary, replay summary
- `processor`: input batch, output points, segment transitions, rejected/recovered points
- `sync`: outbox enqueue, worker drain, upload/download result, retry/failure
- `media`: photo import, copy, restore download, missing local file repair
- `maps`: map load failure, route variant selection, fit/bounds diagnostics

### Event Shape

Prefer structured objects over free-form strings:

```ts
interface TrailbookDiagnosticEvent {
  category: string;
  name: string;
  timestamp: string;
  tripLocalId?: string;
  segmentLocalId?: string;
  severity: "debug" | "info" | "warning" | "error";
  payload: Record<string, unknown>;
}
```

Rules:

- No auth tokens.
- No raw photo files.
- No full personal data unless user explicitly exports a support bundle.
- Raw coordinates are allowed in local diagnostics and explicit support bundles, because route diagnostics require them.

## Support Bundle V1

Add a versioned support bundle schema.

Required fields:

- `schemaVersion`
- app version, build number, runtime version
- platform, OS version, device model if available
- user id/email/role if logged in
- permission/capability status
- battery optimization status on Android if available
- active recording session summary
- recent recording diagnostics
- raw location event summary for selected trip
- sync outbox summary
- media restore summary
- route variant summary
- feature flag snapshot

Optional fields for test users:

- selected trip raw event sample
- selected trip processor replay summary
- selected trip segment/point summary
- native location service events after `PLAN_51E`

Acceptance rules:

- Bundle must include `schemaVersion`.
- Bundle must never include access token, refresh token or password.
- Bundle must be safe to attach to support email.
- Test-user bundle may include coordinates; normal-user bundle should be summary-first.

## Crash Reporting Decision

### Option A: Keep Crash Reporting Disabled For Now

Valid while app is internal/test-only.

Requirements:

- error boundary remains active
- support bundle can be generated after recoverable errors
- fatal crashes can be investigated through device logs during testing

### Option B: Enable Sentry Before Store Release

Recommended before wider beta.

Implementation steps:

1. Add `@sentry/react-native`.
2. Configure DSN by environment.
3. Set release/build metadata.
4. Add PII scrubbing.
5. Disable token/session capture.
6. Attach support bundle id or short diagnostic summary when possible.

Acceptance criteria:

- Render error is visible in Sentry.
- Unhandled promise rejection is visible in Sentry.
- Native crash is visible in Sentry if supported by current build setup.
- No auth token appears in captured event.

## Release Readiness

Keep `docs/RELEASE_READINESS.md` as the checklist source of truth.

Required release sections:

- app identity: name, icon, splash, versioning
- store contact: `sc-trailbook@gmail.com`
- privacy policy
- account deletion/data deletion
- background location permission rationale
- camera/photo permission rationale
- activity recognition permission rationale
- local data retention policy
- sync/server data policy
- open-source licenses
- production API URL and maps key restrictions
- SQLite encryption decision
- crash reporting decision
- test-user/debug feature removal or gating verification

Acceptance criteria:

- Every release item has status: `todo`, `in_progress`, `done`, or `not_applicable`.
- Every `todo` item has an owner or explicit blocker.
- Release build does not expose debug tools to normal users.

## Implementation Steps

### Step 1: Support Bundle Schema

- Define a `SupportBundleV1` type.
- Add a single builder service for support bundle data.
- Ensure existing support email uses this builder.
- Add token scrubber test.

### Step 2: Diagnostic Event Normalization

- Introduce a small diagnostic event writer API.
- Keep existing tables if they are useful, but standardize event names and payload shape.
- Add adapters from current recording diagnostics to normalized events.

### Step 3: Error Boundary Integration

- Make screen-level error boundaries produce a diagnostic event.
- Add user-facing action to contact support where appropriate.
- Include recent diagnostic summary in support email.

### Step 4: Sentry Decision

- Either explicitly mark Sentry as deferred in release readiness, or configure it.
- If configured, add PII/token scrubbing before enabling it in production builds.

### Step 5: Release Checklist Hardening

- Update `docs/RELEASE_READINESS.md` with statuses.
- Add explicit permissions rationale text.
- Add production maps/API key restriction checklist.
- Add SQLite encryption decision checkpoint.

## Testing

Manual tests:

- Generate support bundle as normal user.
- Generate support bundle as `test_user`.
- Verify support bundle does not include tokens.
- Trigger render error and verify error boundary behavior.
- Trigger sync failure and verify outbox summary appears.
- Trigger missing camera/location permission and verify capability status appears.

Release tests:

- Build release APK/IPA.
- Verify debug tools are hidden for normal user.
- Verify About shows app version/build/support email.
- Verify permissions copy matches store review expectations.

## Acceptance Criteria

- Support bundle has a stable schema and token scrubbing.
- Error boundary and diagnostics use the same support path.
- Crash reporting is either explicitly deferred or safely configured.
- Release readiness checklist is actionable, not just notes.
- Normal users never see test/debug tools.
- Field reports can distinguish app processing bugs from OS/native delivery gaps.

## Implementation Status

Status: implemented first production-hardening slice.

Implemented:

- Added `SupportBundleV1` with `schemaVersion`, bundle id, feature flag snapshot, media summary and route variant summary.
- Support bundle serialization now scrubs token/password/secret/cookie/authorization fields and sensitive URL query values.
- Added local normalized `diagnostic_events` storage and writer API.
- Error boundaries now record local diagnostic events in addition to existing crash-reporting scaffold.
- Support bundle includes recent normalized diagnostic events.
- `docs/RELEASE_READINESS.md` is now a status-based release checklist with explicit Sentry deferral.

Remaining release work:

- Sentry is still deferred while Trailbook is internal/test-only.
- Privacy policy, account deletion policy, production API/maps key verification and SQLite encryption decision remain release blockers.
