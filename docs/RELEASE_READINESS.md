# Trailbook Release Readiness

This checklist is the source of truth for App Store / Google Play readiness.

Statuses: `todo`, `in_progress`, `done`, `not_applicable`.

## App Identity

| Item | Status | Owner / Blocker |
| --- | --- | --- |
| App name, icon and splash are final. | in_progress | Final visual review before store submission. |
| Version name/build number strategy is defined. | in_progress | Verify release build values during APK/IPA build. |
| About screen shows app name, version, build and support email. | done | Implemented in mobile About screen. |
| Store support contact is `sc-trailbook@gmail.com`. | done | Same email is shown in About. |

## User-Facing Documents

| Item | Status | Owner / Blocker |
| --- | --- | --- |
| Privacy policy covers location recording, waypoint photos, account data, sync data and support diagnostics. | todo | Required before public beta/store submission. |
| Terms/contact page is published. | todo | Required before public beta/store submission. |
| Account deletion policy covers account, trips, groups, photos and shared trips. | todo | Requires backend deletion endpoint/process. |
| Local data policy explains offline SQLite storage, raw recording events and cached photos. | todo | Required before public beta/store submission. |
| Open-source license screen/source generation is defined. | todo | Need dependency license audit. |

## Permission Rationale

| Permission | Status | Store/User Rationale |
| --- | --- | --- |
| Foreground location | done | Required to show current position and start route recording. |
| Background location | done | Required because trip recording must continue while the app is not visible. |
| Motion activity | done | Used only to improve AUTO mode profile detection. |
| Camera | done | Used for waypoint photos. |
| Photo library | done | Used for attaching existing waypoint photos. |
| Notifications / foreground service visibility | done | Required for Android foreground recording service visibility. |

## Security And Privacy

| Item | Status | Owner / Blocker |
| --- | --- | --- |
| Support bundles never include auth tokens/passwords. | done | SupportBundleV1 serialization uses token scrubber. |
| Support bundle has stable schema/version. | done | `schemaVersion: 1`. |
| Debug/test tools are hidden from normal users. | done | Settings sections are gated by `test_user` feature flags. |
| Dev credentials are not present in production builds. | todo | Verify before release build. |
| `.env.example` contains no secrets. | done | Keep checked in examples placeholder-only. |
| SQLite encryption decision is closed. | todo | Deferred until app is otherwise deployment-ready. |
| Support diagnostics coordinate policy is documented. | in_progress | Test-user bundles may include coordinates; normal-user support should stay summary-first. |

## Observability

| Item | Status | Owner / Blocker |
| --- | --- | --- |
| Local diagnostic events are normalized. | done | `diagnostic_events` table and writer API. |
| Error boundaries create diagnostic events. | done | App and screen error boundaries record local events. |
| Support bundle includes recording/native/diagnostic summaries. | done | SupportBundleV1 includes recent diagnostics and summaries. |
| Crash reporting provider is selected. | todo | Sentry is deferred while internal/test-only. Required before wider beta. |
| Crash reporting token/PII scrub is verified. | todo | Required if Sentry is enabled. |

## Build Configuration

| Item | Status | Owner / Blocker |
| --- | --- | --- |
| Production API URL is verified. | todo | Check release environment before build. |
| Android background-location and foreground-service declarations are verified. | in_progress | Validate release APK permissions after every native change. |
| iOS location usage strings and background location capability are verified. | in_progress | Verify standalone iOS build, not Expo Go. |
| Maps SDK keys are restricted by platform/application identifiers. | todo | Verify Google Cloud console restrictions. |
| Android battery optimization guidance is present. | in_progress | Current app can inspect/prompt for unrestricted status. |

## Open Decisions

| Decision | Status | Owner / Blocker |
| --- | --- | --- |
| Sentry / crash reporting | todo | Deferred for internal testing; blocker before wider beta. |
| Analytics policy | not_applicable | No analytics until there is a concrete product need. |
| SQLite encryption library and migration strategy | todo | Pre-release privacy/security decision. |
| Offline map cache retention/deletion policy | todo | Needed before implementing offline maps. |
