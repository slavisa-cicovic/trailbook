# PLAN 74: Google Play Billing and Release

## Goal

Prepare and publish Trailbook for Android on Google Play with real Google Play
subscriptions, server-authoritative Premium entitlement, production-safe
account handling, and a verified Play Store release.

Android must preserve the product behavior approved on iOS:

- one optional local test trip with at most three photos;
- full Premium during an eligible seven-day introductory trial;
- monthly and yearly auto-renewing subscriptions;
- backend-confirmed entitlement for sync, restore and sharing;
- locally cached verified entitlement for temporary offline recording;
- in-app and web account deletion paths;
- no fake purchase controls in production.

## Status

Phases 1, 2, 3 and 5 are complete, including a Play-distributed license-test
purchase, restore, cancellation and accelerated expiration. Phase 4 RTDN
backend handling is implemented and tested; Google Cloud Pub/Sub setup and a
production test notification remain.

## Decisions

- Use package ID `com.slavisacicovic.trailbook`.
- Use EAS Build and an Android App Bundle (`.aab`).
- Use the existing `expo-iap` integration rather than RevenueCat.
- Add a real `google` provider behind the provider-neutral backend.
- Verify and acknowledge purchases on the backend before granting entitlement.
- Configure Real-time Developer Notifications (RTDN) through Pub/Sub.
- Use one Google Play subscription product, `trailbook_premium`, with monthly
  and yearly auto-renewing base plans.
- Map base plans to existing internal plans:

```text
monthly -> premium_monthly
yearly  -> premium_yearly
```

- Configure a seven-day free-trial offer for eligible users on both base plans.
- Display Play-localized prices and offer metadata; do not hard-code Android
  prices or trial eligibility.
- Do not ship a lifetime purchase in the first Google Play release.
- Google and Apple are separate store purchases. Trailbook ownership rules must
  still prevent unrelated accounts from claiming the same store purchase.

## Non-Goals

- Do not redesign the approved Premium model.
- Do not add external or alternative billing.
- Do not automate CI/CD release promotion in the first version.
- Do not add advertisements or tracking SDKs.
- Do not change iOS behavior unless a shared bug requires it.

## Phase 1: Play Console Account and App Record

Status: Done

### Developer account

- Verified personal Google Play Developer account created on August 3, 2026.
- Identity, contact, payments profile and Android-device verification completed.
- Two-step verification is enabled on the owner Google account.
- The account is subject to the new-personal-account closed test: at least 12
  opted-in testers for 14 continuous days before applying for production
  access.

### App record

Play Console app created:

```text
App name: Trailbook: Trips & Trails
Default language: English (United States)
App or game: App
Free or paid: Free
Package: com.slavisacicovic.trailbook
```

Acceptance:

- Play Console account is verified;
- Trailbook app record uses the exact package ID;
- production-access testing requirements are known;
- no build was uploaded under a different package name.

## Phase 2: Google Play Subscription Catalog

Status: Done

Completed August 4, 2026:

- subscription `trailbook_premium` is active;
- auto-renewing base plans `monthly` and `yearly` are active in 174 regions;
- offers `monthly-free-trial` and `yearly-free-trial` are active;
- both offers provide seven days free before standard recurring billing;
- the Trailbook account group is enrolled in the 15% service-fee tier.

Create one subscription product:

```text
Product ID: trailbook_premium
Name: Trailbook Premium
```

Create two auto-renewing base plans:

```text
Base plan ID: monthly
Billing period: 1 month

Base plan ID: yearly
Billing period: 1 year
```

Configure Serbian/EUR reference pricing and review converted regional prices.
For each base plan, configure an eligible-new-customer offer:

```text
Offer phase: free
Duration: 7 days
Then: selected base-plan recurring price
```

Acceptance:

- product and base plans are active for test tracks;
- monthly/yearly prices are correct;
- trial and post-trial billing are clear;
- product, base-plan and offer IDs are recorded without secrets.

## Phase 3: Google Play API and Backend Foundation

Status: Done

- Enable Google Play Developer API in the linked Cloud project.
- Create a least-privilege service account for purchase verification.
- Grant only permissions needed to inspect and acknowledge subscriptions.
- Store credentials in AWS Secrets Manager or SSM SecureString, never in Git,
  EAS public variables or the mobile bundle.
- Add catalog mapping that includes `productId` and `basePlanId`.
- Implement `GooglePurchaseProvider` using
  `purchases.subscriptionsv2.get`.
- Validate package, product, base plan, purchase state, expiry and Trailbook
  account ownership before activating entitlement.
- Do not grant Premium for pending purchases.
- Persist and then acknowledge every valid initial purchase server-side.
- Use purchase token, not `orderId`, for identity and idempotency.
- Add stable Google error codes and secret-safe structured logs.

Implemented in the repository:

- `GooglePurchaseProvider` verifies subscriptions through
  `purchases.subscriptionsv2.get`;
- `GET /api/purchases/google/account-id` returns the stable opaque account ID
  that Android must pass to Google Play;
- `POST /api/purchases/google/verify` validates product/base-plan/account/state,
  applies the normalized event, and only then acknowledges the purchase;
- pending purchases are persisted without granting Premium or acknowledging;
- provider/base-plan catalog mapping and ownership-conflict protection are in
  the shared purchase application path;
- fixture tests cover active, pending, grace, hold, canceled and expired states.

External setup completed August 4, 2026:

- Google Play Android Developer API is enabled in Cloud project
  `nth-champion-492214-c4`;
- dedicated service account `trailbook-play-billing` is active;
- Play Console grants only financial/order visibility and subscription/order
  management access;
- a JSON credential was generated for later server secret deployment and is
  not stored in the repository.

Acceptance:

- Google fixtures normalize into shared purchase events;
- invalid package/product/token/ownership is rejected;
- valid purchase is persisted before acknowledgment;
- duplicate verification is idempotent;
- Apple provider tests remain green.

## Phase 4: Real-time Developer Notifications

Status: Done

- Create a dedicated Pub/Sub topic for Google Play RTDN.
- Authorize Google Play to publish to it.
- Deliver notifications to a secured backend integration.
- Deduplicate Pub/Sub `messageId`.
- Fetch current state from Google for each event instead of trusting the
  notification as entitlement proof.
- Normalize purchase, renewal, cancel-will-expire, grace period, account hold,
  recovery, expiration, revocation/refund and plan-change events.
- Persist audit metadata with retention and replay support.
- Add alarms for verification failures, stale notifications and unknown
  products.

Implemented in the repository:

- authenticated `POST /api/v1/purchases/google/notifications` push endpoint;
- Google-signed OIDC token verification with exact audience, verified email and
  dedicated push service-account identity checks;
- durable `google_purchase_notifications` audit with Pub/Sub `messageId`
  deduplication, attempts, failure details and retry-safe processing;
- package validation and purchase-owner lookup through the previously verified
  purchase token;
- authoritative `purchases.subscriptionsv2.get` refresh for every subscription
  lifecycle notification before changing entitlement;
- fixture tests for Play Console test messages, duplicates, renewal and the
  initial-purchase/RTDN race.

Completed Google Cloud/AWS setup:

- created the Pub/Sub topic and dedicated authenticated push service account;
- allowed `google-play-developer-notifications@system.gserviceaccount.com` to
  publish to the topic;
- created a push subscription targeting
  `https://api.trailbook.rs/api/v1/purchases/google/notifications`;
- set the same endpoint as the OIDC audience and stored its value plus the push
  service-account email in the ECS task configuration;
- ran the database migration, deployed the new backend revision and sent the
  Play Console test message.

Live verification completed August 4, 2026:

- Pub/Sub topic `trailbook-google-play-rtdn` and authenticated push subscription
  `trailbook-google-play-rtdn-push` are active;
- Google Play has publisher-only access to the topic and Pub/Sub can mint OIDC
  tokens only for the dedicated `trailbook-pubsub-push` service account;
- ECS revision 13 runs the immutable `rtdn-20260804` backend image;
- the production audit migration was applied successfully;
- Play Console test message `20897600760199281` reached the production endpoint
  once and was persisted with status `processed`, one attempt and no error.

Acceptance:

- test notification reaches production backend;
- duplicate delivery is harmless;
- lifecycle events converge `purchase_access`;
- missed-event reconciliation is possible.

## Phase 5: Android Mobile Billing

Status: Implemented; Play-distributed build and device verification pending

- Refactor the Apple-specific provider boundary into a store-neutral native IAP
  provider while preserving the paywall.
- Load `trailbook_premium` and its offers through `expo-iap` on Android.
- Select the correct monthly/yearly offer token.
- Pass an obfuscated Trailbook account identifier where supported, never email.
- Send product ID, base plan and purchase token to the backend.
- Coordinate finishing with backend verification and server acknowledgment.
- Recover pending/unfinished purchases after restart.
- Reconcile current Play purchases with backend state for restore.
- Open Google Play subscription management from the status screen.
- Show retry/error states when the Play catalog is unavailable.

Implemented in the repository:

- Android-only `GoogleIapProvider` using the existing `expo-iap` native module;
- localized monthly/yearly cards derived from Play base-plan offer metadata;
- eligible free-trial offer selection with fallback to the standard base plan;
- opaque Trailbook account ID passed as `obfuscatedAccountId`;
- purchase token/base plan verification through the Trailbook backend before
  finishing the transaction;
- pending purchases remain locked and unfinished;
- startup recovery and manual restore re-verify current Play purchases;
- subscription management deep-links to Google Play;
- Apple provider behavior remains isolated and unchanged.

Acceptance:

- Android never invokes Apple-specific APIs;
- localized monthly/yearly offers load from Play;
- canceled flows are not shown as errors;
- pending purchases do not unlock Premium;
- purchase, restart recovery and restore converge on backend state.

## Phase 6: Android Entitlement and Regression QA

Status: Pending

Test on physical Android devices:

- normal user gets one local test trip and three photos;
- second trip is blocked without Premium;
- purchase activates recording, sync, restore and sharing;
- offline recording follows verified-cache policy;
- logout/login and account switching preserve ownership;
- deleting a Trailbook account removes cloud data and purchase linkage without
  canceling the Google subscription automatically;
- Google login uses an in-app authentication session;
- foreground location notification and screen-locked recording work;
- stop, processing, map, waypoint photos and sync work;
- no test/admin/data-tool UI is visible to normal production users.

Acceptance:

- shared iOS behavior has no regression;
- Android permission/background recording is stable;
- ownership conflicts have clear user-facing messages.

## Phase 7: Play Store Policy and Listing

Status: Pending

Prepare:

- title, short/full descriptions and category;
- icon, feature graphic and phone screenshots;
- privacy policy and support details;
- content rating, ads and target-audience declarations;
- Data safety answers for identity, precise/background location, photos, user
  content, purchases, usage and diagnostics actually collected;
- app-access instructions and reviewer account;
- subscription disclosures and test instructions;
- account deletion declaration.

Google requires both:

- the existing in-app deletion path; and
- a public web URL where users can request account and associated-data deletion.

Acceptance:

- policy answers match production behavior;
- reviewer can log in and test Premium;
- account deletion URL is public and functional;
- screenshots contain no private or misleading data.

## Phase 8: Internal and Closed Testing

Status: Internal build uploaded; tester rollout and billing QA pending

Completed August 4, 2026:

- production Android App Bundle `1.0.0` (`versionCode` 5) built successfully
  through EAS;
- AAB submitted successfully to the Google Play `internal` track through the
  dedicated `trailbook-eas-submit` service account;
- build includes the native `expo-iap` Android module and uses the deployed
  revision 12 Google Billing backend.
- Play-distributed license-test purchase completed end to end: localized
  monthly/yearly offers loaded, the monthly test purchase was recovered after
  a temporary API-permission failure, server verification succeeded, Google
  acknowledged the purchase, and Trailbook Premium became active.
- The accelerated license-test subscription was canceled in Google Play,
  remained usable until its verified period end, then expired correctly: the
  Premium screen returned to no active plan and the server-protected restore
  operation again required Trailbook Premium.
- Production RTDN lifecycle verification completed end to end: the initial
  `SUBSCRIPTION_PURCHASED` raced mobile verification and succeeded after safe
  Pub/Sub retries; three `SUBSCRIPTION_RENEWED` events extended entitlement;
  `SUBSCRIPTION_CANCELED` disabled auto-renew while preserving access until the
  period end; and `SUBSCRIPTION_EXPIRED` removed entitlement without a manual
  purchase restore. Every post-purchase RTDN was processed once without error.
- A stale Premium-screen snapshot found during expiry testing was fixed by
  refreshing server-authoritative access on screen focus and every 30 seconds
  while the Premium screen remains focused.

- Add Android production build/submit scripts.
- Build a production bundle:

```bash
cd mobile
eas build --platform android --profile production
```

- Upload the first `.aab` manually or through EAS Submit to internal testing.
- Configure license testers and test payment methods.
- Test purchase, renewal, cancel, grace, hold, expiration, refund and restore.
- If required, run a closed test with at least 12 opted-in testers continuously
  for at least 14 days.
- Record feedback and fixes before applying for production access.

Acceptance:

- signed bundle is served by Google Play testing;
- billing works from a Play-distributed build;
- internal smoke test passes;
- mandatory closed testing, if applicable, is completed.

## Phase 9: Production Release

Status: Pending

- Apply for production access if required.
- Resolve pre-launch report, policy and review findings.
- Submit app, subscriptions and release for review.
- Use a cautious initial rollout if available.
- Verify public listing, production install and production subscription.
- Monitor CloudWatch, Android vitals, subscription reports and RTDN.

Acceptance:

- Trailbook is publicly installable from Google Play;
- Google purchase grants and later removes entitlement correctly;
- no secrets or fake purchase controls ship;
- rollout and rollback procedures are documented.

## Required Configuration

Backend secrets:

```text
GOOGLE_PLAY_PACKAGE_NAME=com.slavisacicovic.trailbook
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=<secret>
GOOGLE_PLAY_PUBSUB_AUDIENCE=<push audience>
GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL=<authenticated push service account>
```

Non-secret catalog configuration:

```text
GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID=trailbook_premium
GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID=monthly
GOOGLE_PLAY_YEARLY_BASE_PLAN_ID=yearly
```

Production safety:

```text
ENABLE_FAKE_PURCHASES=false
DISABLE_PURCHASE_ENTITLEMENT_ENFORCEMENT=false
```

## Key Risks

- New personal accounts may add a mandatory 14-day closed-test lead time.
- Google offer tokens differ from Apple's two-product model.
- Google automatically refunds unacknowledged initial purchases.
- RTDN is a signal, not proof; backend verification is mandatory.
- Foreground-location service policies can block release.
- Data safety must include SDK behavior, not only Trailbook code.
- Google requires a web deletion path in addition to in-app deletion.

## Completion Criteria

- real monthly/yearly Google subscriptions are available;
- backend verifies, binds, persists and acknowledges Google purchases;
- RTDN drives the lifecycle idempotently;
- Premium behavior matches iOS;
- Android recording and trip workflows pass physical-device QA;
- policy forms and deletion requirements are complete;
- required testing track is completed;
- Trailbook is approved and public on Google Play.
