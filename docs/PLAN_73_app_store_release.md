# PLAN 73: App Store Release Preparation

Status: Done

Trailbook 1.0, build 4, was approved with both subscriptions and released
publicly on the App Store on July 31, 2026.

## Goal

Prepare Trailbook iOS for App Store distribution, starting with TestFlight and
ending with a production App Store submission.

This plan is iOS-only. Google Play is a separate follow-up plan.

## Decisions

- Use EAS Build for iOS production builds.
- Use the existing bundle identifier: `com.slavisacicovic.trailbook`.
- Use the public production backend: `https://api.trailbook.rs/api/v1`.
- Keep Google and Apple sign-in. Facebook sign-in is intentionally not supported.
- Keep Expo Go/debug login as development-only behavior.
- Submit through App Store Connect after TestFlight validation.

## Non-Goals

- Do not prepare Google Play in this plan.
- Do not automate CI/CD submission yet.
- Do not redesign onboarding or purchase flows unless App Review blocks release.
- Do not remove diagnostic/test-user features unless they are visible to normal users.

## Phase 1: Apple Developer And App Store Connect Setup

### Apple Developer

Verify:

- App ID exists for `com.slavisacicovic.trailbook`.
- Capabilities are enabled:
  - Sign in with Apple;
  - Background Modes / Location Updates as required by native config;
  - Associated Domains only if universal links are introduced later.
- Sign in with Apple Services ID is configured for web/backend login:
  - domain: `api.trailbook.rs`;
  - callback: `https://api.trailbook.rs/api/v1/auth/apple/callback`.

### App Store Connect

Create the app record:

- platform: iOS;
- bundle ID: `com.slavisacicovic.trailbook`;
- app name: `Trailbook`;
- primary language;
- SKU.

Prepare metadata:

- subtitle;
- description;
- keywords;
- support URL;
- marketing URL if needed;
- privacy policy URL;
- category;
- age rating questionnaire.

## Phase 2: Production Mobile Config

### EAS Environment

Set production EAS env:

```text
EXPO_PUBLIC_API_URL=https://api.trailbook.rs/api/v1
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=...
EXPO_PUBLIC_DEV_LOGIN_ENABLED=false
EXPO_PUBLIC_ENABLE_FAKE_PURCHASES=false
EXPO_PUBLIC_ENABLE_TRIP_DIAGNOSTICS=false
```

Review whether test-only toggles are absent from production:

- fake purchases;
- trip diagnostics;
- debug login;
- local API URLs.

### App Config

Verify `mobile/app.config.js`:

- app name and slug are correct;
- bundle identifier is correct;
- version is correct;
- build number / EAS remote auto versioning is understood;
- iOS location permission text is accurate;
- background location mode is intentionally enabled;
- `ITSAppUsesNonExemptEncryption=false` is still valid;
- Google Maps key is present in production build.

### Deep Links

Verify native deep link:

```text
trailbook:///auth/callback
```

Acceptance:

- Google sign-in returns to the iOS app;
- Apple sign-in returns to the iOS app;
- Expo Go debug fallback is not visible in production native app.

## Phase 3: Privacy And App Review Readiness

### Privacy Policy

Create or update a public privacy policy URL covering:

- location data;
- background location recording;
- waypoint photos;
- account identifiers/email;
- cloud sync to AWS;
- sharing links and PIN-protected shared trips;
- purchases/subscriptions if enabled;
- data deletion/contact process.

### App Privacy Nutrition Labels

Prepare App Store privacy answers for data categories:

- Location;
- Photos or Videos;
- User ID / email;
- Purchase history if purchases are enabled;
- Diagnostics if enabled in production;
- User-generated content if applicable.

Mark whether data is:

- linked to user;
- used for app functionality;
- used for analytics/tracking.

Trailbook should not claim third-party advertising tracking unless that is
actually introduced.

### Permission Review

Review App Review-sensitive points:

- Background location is user-initiated recording only.
- App clearly shows recording state.
- App does not start recording without user action.
- App explains why Always Location is needed.
- Photos/camera are only for waypoint images.

Acceptance:

- Reviewer can understand location usage from UI and permission text.
- App does not request permissions before they are needed.

## Phase 4: Production Build And TestFlight

### Build

Run production iOS build:

```bash
cd mobile
eas build --platform ios --profile production
```

or add/use an npm script if preferred.

### TestFlight Upload

Use EAS submit or manual App Store Connect upload.

Recommended first pass:

```bash
eas submit --platform ios
```

Acceptance:

- build appears in App Store Connect;
- TestFlight processing completes;
- internal testers can install it.

### TestFlight Smoke Test

On a clean install:

- Google sign-in works;
- Apple sign-in works;
- recording works with screen locked;
- stop recording completes;
- trip details open;
- add waypoint photo;
- sync trip and image to AWS;
- delete local trips;
- restore from server;
- sharing web link works;
- logout/login works;
- no debug/fake purchase UI appears for normal user.

## Phase 5: App Store Submission

### Screenshots

Prepare required iPhone screenshots:

- recording screen;
- trip details/map;
- waypoint photos;
- sharing view or trips list;
- settings/account if useful.

Use real-looking but non-sensitive data.

### Review Notes

Provide reviewer notes:

- app records user-initiated trips;
- background location is used only while recording;
- test account if needed;
- steps to test recording and sync;
- mention Sign in with Apple is available.

### Submission

Submit the TestFlight-approved build for App Review.

Acceptance:

- App Review submission created;
- no missing privacy/metadata blocking issues;
- no rejected permission wording;
- no login dead-end for reviewer.

## Phase 6: Post-Approval Operational Checks

After approval/release:

- verify production API health;
- verify CloudWatch logs;
- verify RDS/S3 data after first real sync;
- verify App Store build uses production API;
- monitor auth failures, sync failures and media upload failures.

## Open Questions

- What is the final privacy policy URL?
- Will purchases be enabled in the first App Store submission or delayed?
- Do we need a reviewer test account, or is Apple/Google login enough?
- Should `test_user` diagnostics be hidden unless server role is `test_user`?
- Are all screenshots and metadata available in Serbian/English or only English?
