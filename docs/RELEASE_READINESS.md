# Trailbook Release Readiness

This checklist tracks production requirements that must be closed before App Store / Google Play release.

## Required User-Facing Documents

- Privacy policy: describe location recording, waypoint photos, account data, sync data and support diagnostics.
- Terms/contact: publish support email `sc-trailbook@gmail.com`.
- Account deletion policy: explain how a user deletes account, trips, groups, photos and shared trips.
- Local data policy: explain that trips, raw recording events and photos are stored locally for offline use.

## Permission Rationale

- Foreground location: required to show current position and start route recording.
- Background location: required because trip recording must continue while the app is not visible.
- Motion activity: used only to improve AUTO mode profile detection.
- Camera: used for waypoint photos.
- Photo library: used for attaching existing waypoint photos.
- Notifications: used for Android foreground recording service visibility.

## Security And Privacy

- Support bundles must never include auth tokens.
- Debug/test tools must remain behind feature flags for `test_user`.
- Dev credentials must not be present in production builds.
- `.env.example` must not contain secrets.
- SQLite encryption remains a pre-release decision for private route/photo metadata.

## Build Configuration

- Verify production API URL.
- Verify app icon and splash screen.
- Verify Android background-location and foreground-service declarations.
- Verify iOS location usage strings and background location capability.
- Verify Maps SDK keys and platform restrictions.

## Open Decisions

- Crash reporting provider.
- Analytics policy, if any.
- SQLite encryption library and migration strategy.
- Open-source license screen/source generation.
- Offline map cache retention/deletion policy.
