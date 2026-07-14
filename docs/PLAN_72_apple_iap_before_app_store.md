# PLAN 72: Apple In-App Purchase Before App Store Release

## Goal

Implement real Apple In-App Purchase entitlement before publishing Trailbook to
the App Store.

This is required because Trailbook has meaningful offline value. Server-side
sync restrictions alone are not enough: a user could still record trips,
waypoints and photos locally without paying.

The implementation must cover both:

- initial purchase verification;
- the complete subscription lifecycle after purchase.

The result must remain correct after:

- renewals;
- canceled auto-renewal;
- billing failures;
- grace periods;
- expiration;
- refunds;
- revocation;
- reinstall;
- restore purchases;
- temporary backend unavailability;
- temporary device offline periods.

---

## Decisions

- Apple purchase must be implemented before App Store release.
- App Store release preparation is a separate follow-up plan.
- Google Play Billing is not part of this plan.
- Facebook login is not supported.
- Purchase enforcement must protect local core usage, not only backend sync.
- Backend remains the authority for verified cloud entitlement and account ownership.
- Mobile caches verified entitlement so paid users can record while offline.
- Test users/admins may bypass entitlement for diagnostics and development.
- Use direct App Store integration through the Expo-native `expo-iap` adapter.
- RevenueCat is not part of the first implementation.
- Monthly and yearly subscriptions belong to one App Store subscription group.
- Lifetime purchase is not included in the first App Store release.

- App Store Server Notifications V2 are mandatory before release.
- Every Apple purchase must be bound to a Trailbook user through `appAccountToken`.
- One Apple `originalTransactionId` must not silently unlock multiple unrelated
  Trailbook accounts.
- Cloud operations require backend-confirmed entitlement.
- Offline local recording may use a locally verified StoreKit entitlement as a
  temporary fallback.
- Mobile must never unlock premium from an unverified StoreKit result or a plain
  local boolean flag.
- Prices shown in the paywall must come from StoreKit product metadata.
- Fake purchase controls must be completely disabled in production.
- Provider adapters must emit normalized purchase events and must not directly
  mutate entitlement state outside the shared purchase application service.

---

## Non-Goals

- Do not implement Google Play Billing here.
- Do not build a complex subscription management portal.
- Do not support multiple paid tiers unless required.
- Do not rely only on app-side flags without backend verification.
- Do not publish to App Store before this plan is complete.
- Do not add RevenueCat in the first implementation.
- Do not introduce family sharing unless explicitly planned later.
- Do not introduce promotional offers, offer codes or complex trials in the
  first implementation.
- Do not implement lifetime purchase in App Store Connect for the first release.
- Do not use email, username or other personally identifying values as
  `appAccountToken`.

---

## Product Model

Initial products:

- monthly subscription;
- yearly subscription.

Lifetime purchase is not part of the first release.

Lifetime may remain as a reserved backend/product-code concept if it does not
complicate the flow, but it must:

- not be displayed in UI;
- not be returned as an active Apple product;
- not be configured as an active App Store product;
- not participate in entitlement calculation for the first release.

Existing configured product IDs may be reused if they exactly match App Store
Connect:

```text
trailbook_premium_monthly
trailbook_premium_yearly
trailbook_lifetime
```

Active Apple products for V1:

```text
trailbook_premium_monthly
trailbook_premium_yearly
```

Entitlement:

```text
premium
```

Premium unlocks:

- recording real trips;
- adding waypoints;
- attaching photos;
- sync/restore;
- sharing.

---

## Trial and Pre-Purchase Experience

Trailbook does not provide a permanently renewable demo quota.

Before starting an Apple subscription, each signed-in user may optionally create
one local test trip with up to three photos.

The local test trip:

- is stored only on the device;
- user has no cloud sync;
- user has no cloud restore;
- user has no sharing;
- user has no web access;
- is intended only to verify recording, route quality and waypoint/photo flow.

The trip, route, waypoints and photos remain local, but the backend records that
the authenticated user consumed the one-time test trip allowance. A local-only
flag is not sufficient because reinstalling or clearing application data would
otherwise reset the allowance.

After the local test trip is used, starting another real trip requires Premium.

Apple Premium subscriptions include a seven-day introductory free trial for
eligible users, configured in App Store Connect.

During an eligible free trial, the user receives the complete Premium
entitlement:

- recording;
- waypoints;
- photos;
- sync;
- restore;
- sharing.

The application must use StoreKit eligibility and product metadata to determine
whether the user is eligible for an introductory offer.

The application must not describe an Apple free trial as a billing grace period.
Billing Grace Period is reserved for existing subscribers whose renewal payment
fails and is handled as part of the subscription lifecycle.

Free trial access ends according to the verified Apple subscription state.

The application must clearly disclose:

- trial duration;
- subscription price after the trial;
- billing period;
- automatic renewal;
- how to cancel/manage the subscription.

Recording enforcement becomes:

```text
premium entitlement active -> recording allowed
introductory free trial active -> recording allowed
local test trip unused -> one local test trip allowed
local test trip already used and no premium -> paywall
```

Cloud operations remain premium-only.

---

## Subscription State Model

Use an explicit backend state model.

Recommended statuses:

```text
pending
active
in_grace_period
billing_retry
canceled_will_expire
expired
revoked
```

Recommended normalized access shape:

```ts
interface PurchaseAccess {
  entitlement: "premium" | null;
  entitlementActive: boolean;

  subscriptionStatus:
    | "pending"
    | "active"
    | "in_grace_period"
    | "billing_retry"
    | "canceled_will_expire"
    | "expired"
    | "revoked";

  provider: "apple";
  environment: "sandbox" | "production";

  productId: string | null;
  originalTransactionId: string | null;

  autoRenewEnabled: boolean | null;
  expiresAt: string | null;
  revokedAt: string | null;
  verifiedAt: string;
}
```

Rules:

- canceled auto-renewal does not immediately remove entitlement;
- access remains active until the paid period ends;
- refund/revocation may remove entitlement immediately;
- a valid historical transaction does not by itself prove that the subscription
  is currently active;
- entitlement must be derived from current verified subscription state.

---

## Purchase Account Binding

Every purchase must be associated with the authenticated Trailbook account.

Use:

```text
appAccountToken
```

Rules:

- value must be a UUID;
- value must be stable for the Trailbook account;
- backend owns or issues the UUID;
- mobile sends it when starting the Apple purchase;
- backend validates the verified transaction `appAccountToken`;
- do not send email, username or raw database identifiers to Apple;
- store the association between:
  - Trailbook user;
  - `appAccountToken`;
  - `originalTransactionId`.

Recommended invariant:

```text
one originalTransactionId -> one active Trailbook user
```

A restored purchase must not silently unlock a second unrelated Trailbook
account.

If reassociation is allowed later, it must be:

- explicit;
- authenticated;
- audited;
- protected against account takeover;
- idempotent.

---

## Core Architecture

Apple-specific code must normalize Apple data into the existing internal
purchase event model.

```text
expo-iap / StoreKit
        ↓
ApplePurchaseProvider
        ↓
NormalizedPurchaseEvent
        ↓
PurchaseApplicationService
        ↓
purchase transaction history
subscription state
entitlement state
```

App Store Server Notifications follow the same application path:

```text
Apple notification signedPayload
        ↓
AppleNotificationVerifier
        ↓
NormalizedPurchaseEvent
        ↓
PurchaseApplicationService
```

Provider adapters must not directly update subscription or entitlement tables.

---

## Phase 1: Finalize Product and Pre-Purchase Decisions

Status: Done

Final decisions:

- monthly product ID: `trailbook_premium_monthly`;
- yearly product ID: `trailbook_premium_yearly`;
- subscription group: `Trailbook Premium`;
- eligible new subscribers receive a seven-day introductory free trial;
- each authenticated user may consume one local test trip with at most three
  photos before Premium is required;
- test trip content remains local, while the backend stores only the one-time
  allowance consumption timestamp;
- local premium access is allowed until the earlier of the verified StoreKit
  entitlement expiration and the configured offline maximum;
- monthly offline maximum: 7 days from the last successful entitlement refresh;
- yearly offline maximum: 30 days from the last successful entitlement refresh;
- a locally verified StoreKit entitlement may refresh local access but may never
  extend access beyond its signed expiration date;
- Apple Billing Grace Period preserves Premium until its verified grace-period
  expiration; billing retry without an active grace period does not extend access
  beyond the subscription expiration;
- an Apple `originalTransactionId` belongs to exactly one Trailbook account;
- account reassociation is never automatic; V1 returns an ownership conflict and
  reassociation, if required, is a manual authenticated and audited support action;
- missing premium returns HTTP `403` with code
  `PREMIUM_ENTITLEMENT_REQUIRED`;
- consumed local test allowance returns HTTP `403` with code
  `LOCAL_TEST_TRIP_ALREADY_USED` where a backend check is involved;
- Apple purchase/account ownership conflicts return HTTP `409` with code
  `APPLE_PURCHASE_OWNERSHIP_CONFLICT`.

Implementation consequences:

- the backend user/account model needs a nullable local test trip consumption
  timestamp;
- starting the local test trip must atomically claim the allowance before local
  recording begins;
- if the allowance claim cannot be confirmed, the app must not silently grant a
  renewable local test trip;
- all entitlement and allowance checks must use stable domain codes rather than
  parsing error messages.

These decisions resolve:

- exact monthly and yearly product IDs;
- subscription group name;
- whether a free trial exists;
- local test trip enforcement details;
- exact offline entitlement policy;
- account reassociation policy;
- entitlement-required backend error shape.

Acceptance:

- one product model is documented;
- one pre-purchase test model is documented;
- product IDs are final;
- entitlement rules are testable;
- no implementation depends on unresolved product behavior.

---

## Phase 2: App Store Connect Products

Status: Done

Configured in App Store Connect:

- app record: `Trailbook: Trips & Trails`;
- Apple app ID: `6789852326`;
- bundle ID: `com.slavisacicovic.trailbook`;
- subscription group: `Trailbook Premium`;
- monthly product: `trailbook_premium_monthly`, 1 month, base price
  `EUR 3.99` in Serbia;
- yearly product: `trailbook_premium_yearly`, 1 year upfront, base price
  `EUR 39.99` in Serbia;
- both products are available in all 175 storefronts;
- both products have an English (U.S.) localization;
- both products have a one-week free introductory offer for all storefronts,
  starting July 11, 2026 with no end date;
- Paid Apps Agreement is active;
- EUR bank account is active;
- required U.S. tax forms are active;
- EU Digital Services Act trader verification was submitted and is in review;
- App Store Small Business Program enrollment was submitted on July 13, 2026
  and is awaiting Apple's decision;
- App Review screenshots remain pending until the real mobile paywall exists.

Deferred dependency:

- App Review screenshots cannot be genuine before the mobile paywall is
  implemented. They are completed in Phase 10/13 and do not block backend or
  StoreKit implementation phases.

Create in App Store Connect:

- app record for Trailbook if not already present;
- subscription group: `Trailbook Premium`;
- monthly product;
- yearly product.

Configure:

- product IDs;
- display names;
- descriptions;
- pricing;
- localization;
- review screenshot for subscription/paywall;
- tax and banking agreements;
- subscription group localization;
- App Store Server Notification URLs when backend endpoints are ready.

Rules:

- monthly and yearly must be in the same subscription group;
- product IDs must exactly match backend/mobile configuration;
- prices shown by the application must come from StoreKit;
- do not hardcode production price labels;
- lifetime product must remain inactive/not configured for V1.

Acceptance:

- products exist in App Store Connect;
- products are available in StoreKit testing/sandbox;
- product IDs match backend/mobile config;
- localized prices can be loaded from StoreKit;
- agreements required for paid apps/IAP are active.

---

## Phase 3: Backend Apple Purchase Foundation

Status: Done

Implemented:

- official `@apple/app-store-server-library` integration;
- Apple root certificate verification using certificates published by Apple;
- sandbox/production App Store Server API routing controlled by environment;
- stable per-user UUID `appAccountToken` issued by the backend;
- authenticated account-token and transaction-verification endpoints;
- verification of transaction, bundle, product, environment and account token;
- current subscription status lookup, including grace period, billing retry,
  expiration and revocation normalization;
- idempotent application through `PurchaseApplicationService`;
- permanent one-account ownership constraint for Apple
  `originalTransactionId`;
- database migration for existing deployments;
- unit coverage for active, expired, revoked, grace-period, mismatch,
  ownership and duplicate-verification cases.

Pending external verification:

- configure an App Store Connect In-App Purchase API key in the backend;
- apply the database migration to the deployed database;
- run a real sandbox purchase after the StoreKit mobile phase is implemented.

### Backend Secrets and Configuration

Recommended server configuration:

```text
PURCHASE_PROVIDER_MODE=apple

APPLE_PREMIUM_MONTHLY_PRODUCT_ID=trailbook_premium_monthly
APPLE_PREMIUM_YEARLY_PRODUCT_ID=trailbook_premium_yearly

APPLE_BUNDLE_ID=com.slavisacicovic.trailbook

APPLE_APP_STORE_ISSUER_ID=...
APPLE_APP_STORE_KEY_ID=...
APPLE_APP_STORE_PRIVATE_KEY=...

APPLE_APP_STORE_DEFAULT_ENVIRONMENT=sandbox
APPLE_APP_STORE_ALLOW_SANDBOX=true
APPLE_APP_STORE_ALLOW_PRODUCTION=false
```

Production configuration later:

```text
APPLE_APP_STORE_DEFAULT_ENVIRONMENT=production
APPLE_APP_STORE_ALLOW_SANDBOX=true
APPLE_APP_STORE_ALLOW_PRODUCTION=true
```

Rules:

- private key must be stored in AWS Secrets Manager or SSM SecureString;
- private key must never be exposed to mobile;
- environment must be validated from Apple-signed data;
- mobile input must not be trusted to determine environment;
- TestFlight/App Review sandbox traffic must remain supported by the deployed
  backend.

### Apple Purchase Provider

Implement:

```ts
interface ApplePurchaseVerificationInput {
  userId: string;
  transactionId: string;
  productId: string;
  appAccountToken: string;
}
```

Backend behavior:

1. load the authenticated Trailbook user;
2. validate the configured product ID;
3. request transaction information from App Store Server API;
4. verify the Apple-signed JWS payload;
5. validate:
   - bundle ID;
   - product ID;
   - transaction ID;
   - original transaction ID;
   - environment;
   - `appAccountToken`;
   - revocation information;
   - purchase and expiration timestamps;
6. obtain current subscription status/history when required;
7. normalize the result into internal purchase events;
8. apply the result idempotently through `PurchaseApplicationService`;
9. update purchase transaction history;
10. update subscription state;
11. recalculate entitlement;
12. return current access.

Important:

```text
valid transaction != currently active subscription
```

A historical transaction can be cryptographically valid while the subscription
is expired or revoked.

Acceptance:

- sandbox purchase creates/updates purchase transaction history;
- active subscription grants premium;
- expired subscription does not grant premium;
- revoked/refunded purchase removes premium;
- bundle mismatch is rejected;
- product mismatch is rejected;
- user/account token mismatch is rejected;
- duplicate verification is idempotent.

---

## Phase 4: App Store Server Notifications V2

**[ADDED — RELEASE BLOCKER]**

Status: Done

Implemented:

- public unauthenticated notification endpoint at
  `POST /api/v1/purchases/apple/notifications`;
- JWS, Apple certificate chain, bundle and environment verification using the
  official App Store Server library;
- decoding and validation of signed transaction and renewal information;
- persistent raw notification audit before entitlement processing;
- deduplication by raw payload hash and Apple notification UUID;
- normalized handling for subscription, renewal, renewal-status,
  renewal-preference, billing-failure, expiry, grace-period-expiry, refund and
  revocation events;
- App Store test notification handling and admin test-notification trigger;
- admin notification-history recovery with pagination;
- admin reprocessing of failed notifications;
- safe persistence and acknowledgement of unknown notification types;
- idempotent entitlement application through `PurchaseApplicationService`;
- database migration and unit coverage for test, renewal, cancellation, grace,
  expiry, refund, unknown, duplicate, history-recovery and failed-retry cases.

External verification completed:

- Apple purchase database migration applied to production RDS;
- notification endpoint deployed with App Store Server API secrets;
- production and sandbox notification URLs configured in App Store Connect;
- real App Store sandbox test notification received, verified and persisted as
  `processed`;
- sandbox and production signed notification environments enabled on the
  deployed backend.

Add public HTTPS endpoint:

```http
POST /api/purchases/apple/notifications
```

Optional explicit environment paths:

```http
POST /api/purchases/apple/notifications/sandbox
POST /api/purchases/apple/notifications/production
```

Prefer one endpoint if environment is safely derived from the signed payload.

Required behavior:

1. accept Apple `signedPayload`;
2. verify JWS signature and Apple certificate chain;
3. validate bundle ID;
4. validate environment;
5. decode notification type and subtype;
6. decode `signedTransactionInfo`;
7. decode `signedRenewalInfo`;
8. persist the raw notification/audit record;
9. deduplicate by Apple notification/event identifier;
10. normalize the event;
11. apply through `PurchaseApplicationService`;
12. return HTTP 200 after safe persistence/application.

Support at minimum:

```text
SUBSCRIBED
DID_RENEW
DID_CHANGE_RENEWAL_STATUS
DID_CHANGE_RENEWAL_PREF
DID_FAIL_TO_RENEW
EXPIRED
GRACE_PERIOD_EXPIRED
REFUND
REVOKE
```

Also implement:

- App Store test notification handling;
- notification history recovery;
- logging for unknown notification types;
- safe reprocessing of failed notifications;
- idempotent event application.

Rules:

- notification endpoint must not require Trailbook user authentication;
- Apple payload verification is the authentication mechanism;
- raw signed payloads may be retained for audit according to retention policy;
- unknown events should be logged and acknowledged only when safely persisted;
- backend must not depend only on the mobile app reopening.

Acceptance:

- Apple test notification succeeds;
- renewal extends entitlement;
- canceled auto-renew updates renewal state but preserves access until expiry;
- billing failure moves state to billing retry/grace where applicable;
- expiration removes entitlement;
- refund/revocation removes entitlement;
- duplicate notification does not duplicate access changes;
- missed notification can be recovered through notification history.

---

## Phase 5: Mobile IAP Integration

Status: Done

Implemented:

- Expo-native direct StoreKit integration through `expo-iap`;
- config plugin and native module autolinking for EAS iOS builds;
- application-level IAP connection and transaction listener;
- monthly/yearly StoreKit product loading with localized price and billing period;
- subscription-group introductory-offer eligibility check;
- stable backend-issued `appAccountToken` supplied to StoreKit purchases;
- authenticated backend transaction verification before StoreKit finalization;
- known-product filtering and explicit canceled/failed/pending states;
- current purchase reconciliation on app startup;
- user-initiated restore and backend entitlement refresh;
- Premium screen reachable from Settings, with StoreKit metadata and legal renewal text;
- Expo Go safe fallback without loading the unavailable native IAP module.

External verification pending:

- create and install a new EAS iOS build because this phase adds a native module;
- confirm both products and localized StoreKit metadata load from App Store Connect;
- complete a monthly sandbox purchase and verify backend entitlement;
- complete a yearly sandbox purchase with another eligible sandbox account;
- cancel a purchase sheet and confirm no entitlement is granted;
- verify the transaction is finished only after successful backend persistence.

Use `expo-iap`. It is the Expo Module implementation of the same direct OpenIAP
StoreKit integration; the Nitro-based `react-native-iap` package does not support
Expo projects.

Expected work:

- add native purchase dependency;
- configure iOS native capabilities/configuration;
- use an EAS development build or native build, not Expo Go;
- initialize purchase connection;
- register purchase/update listeners at application startup;
- load monthly/yearly products from StoreKit;
- render localized product metadata;
- start purchase flow with `appAccountToken`;
- receive the verified StoreKit transaction/result;
- send transaction ID to backend;
- finish the transaction only after backend persistence succeeds;
- restore purchases;
- refresh entitlement from backend;
- refresh locally verified StoreKit entitlement.

Rules:

- lifetime purchase is not displayed;
- unknown product IDs are ignored;
- canceled purchase is not treated as an error that grants access;
- StoreKit prices and billing periods are not hardcoded;
- premium is never unlocked from an unverified purchase result;
- transaction processing must be idempotent.

Acceptance:

- sandbox user can purchase monthly;
- sandbox user can purchase yearly;
- app receives transaction update;
- backend verifies transaction;
- premium unlocks only after verification;
- canceled/failed purchase does not unlock premium;
- StoreKit localized price appears correctly;
- purchase can recover after app restart.

---

## Phase 6: Unfinished Transaction Recovery

Status: Done

Implemented:

- durable AsyncStorage queue for unfinished Apple transaction IDs;
- pending records are bound to the Trailbook user that started verification;
- attempt count, last error and next retry time are persisted;
- StoreKit transactions remain unfinished until backend verification succeeds;
- verification retries use exponential backoff capped at 60 seconds;
- retryable network, timeout, rate-limit and backend 5xx failures are separated
  from non-retryable 4xx responses;
- unfinished transactions are rediscovered through the application-level
  StoreKit listener and available-purchase reconciliation after relaunch;
- backend verification remains idempotent when notification and mobile paths
  receive the same Apple transaction;
- the Premium screen displays a persistent verification-pending state and
  prevents repurchasing the same product while it is pending;
- successful backend verification is followed by StoreKit finalization and
  removal from the local pending queue.

External verification pending:

- make the backend unavailable before confirming a sandbox purchase;
- confirm the app persists and displays the pending transaction;
- terminate and relaunch the app while the backend remains unavailable;
- restore backend availability and confirm automatic verification;
- confirm Premium activates and the StoreKit transaction is finalized once.

Handle this case:

1. Apple purchase succeeds;
2. backend is temporarily unavailable;
3. transaction cannot yet be persisted;
4. user closes the app.

Required behavior:

- register transaction listener on every app launch;
- detect unfinished transactions;
- persist pending transaction IDs locally;
- retry backend verification with bounded backoff;
- show a clear `Purchase verification pending` state;
- do not ask the user to buy the same product again;
- finish transaction after backend accepts/persists it;
- keep backend verification idempotent.

Distinguish:

```text
user canceled purchase
Apple purchase failed
Apple purchase succeeded, backend verification pending
purchase fully verified and finished
```

Acceptance:

- backend outage after Apple purchase does not lose the purchase;
- relaunch retries verification;
- duplicate retry does not duplicate subscription state;
- transaction is eventually finished after successful backend verification.

---

## Phase 7: Restore Purchases and Ownership

Status: Done

Implemented:

- restore explicitly synchronizes StoreKit before reading purchases;
- only known Trailbook monthly/yearly products are reconciled;
- each restored transaction is verified by the backend before local access is
  updated;
- duplicate transactions use the existing idempotent backend verification;
- unfinished purchases remain in the persistent pending verification queue and
  retry automatically;
- restore of an already-finished subscription reports backend/offline failure
  and remains safe to retry;
- purchases linked to another Trailbook account do not unlock the current
  account and show an explicit ownership recovery message;
- an account with no active verified subscription remains non-Premium.

Verified on a real iPhone with Apple sandbox:

- same-account restore succeeds;
- restore succeeds after uninstall and fresh install once the current OTA bundle
  is loaded;
- restoring an already-known transaction is idempotent and preserves active
  Premium access;
- restore during a backend outage keeps the StoreKit transaction in the
  persistent verification queue;
- verification automatically recovers after the backend becomes available;
- restoring an expired subscription leaves the Trailbook account without
  Premium and removes stale local Premium display state;
- restore with a fresh Apple sandbox tester that has no purchase history leaves
  the Trailbook account without Premium;
- restoring from another Trailbook account using the same Apple sandbox
  account does not unlock Premium;
- ownership conflict displays a clear recovery/support message.

Restore purchases is a reconciliation flow, not a local unlock flag.

Required flow:

1. authenticated user initiates restore;
2. mobile loads available/current StoreKit purchases;
3. mobile filters known Trailbook product IDs;
4. mobile sends relevant transaction/original transaction IDs to backend;
5. backend verifies Apple state;
6. backend validates `appAccountToken` and ownership;
7. backend reconciles subscription state;
8. backend returns current entitlement;
9. mobile updates local verified access cache.

Required scenarios:

- restore on the same Trailbook account;
- restore after reinstall;
- restore expired subscription;
- restore already-known transaction;
- restore with no Trailbook purchase;
- restore while backend is unavailable;
- restore while offline;
- restore from another Trailbook account using the same Apple ID;
- explicit ownership conflict response.

Recommended ownership conflict code:

```text
APPLE_PURCHASE_ALREADY_LINKED_TO_ANOTHER_ACCOUNT
```

Acceptance:

- same-account restore succeeds;
- expired subscription remains expired;
- duplicate restore is idempotent;
- second unrelated Trailbook account is not silently unlocked;
- ownership conflict produces a clear recovery/support message.

---

## Phase 8: Entitlement Enforcement in Mobile

Status: Done

App must enforce entitlement before premium local actions.

Depending on the local test trip and entitlement state, gate:

- start recording;
- create waypoint;
- attach photo;
- premium-only local diagnostics;
- sync;
- restore;
- sharing.

### Local Access Authority

Use:

```text
backend entitlement snapshot
OR
locally verified StoreKit entitlement
```

Never use:

```text
plain AsyncStorage boolean
unverified StoreKit purchase
client-only manually edited expiration
```

Recommended cached snapshot:

```ts
interface CachedPurchaseAccess {
  entitlement: "premium";
  productId: string;
  originalTransactionId: string;
  environment: "sandbox" | "production";
  expiresAt: string | null;
  verifiedAt: string;
  source: "backend" | "storekit";
}
```

Store sensitive entitlement snapshot metadata in platform-secure storage where
practical.

### Offline Behavior

Do not use only a universal hardcoded 7-day boolean grace period.

Policy:

```text
allow local premium while:
- the verified entitlement is not expired; and
- the verification age is inside the configured offline maximum.

A locally verified StoreKit entitlement may refresh the local snapshot, but it
must not extend access beyond the signed StoreKit expiration date.
```

Configured V1 values:

```text
monthly subscription offline maximum: 7 days
yearly subscription offline maximum: 30 days
```

Cloud actions still require backend availability and active backend entitlement.

Bypass:

- `test_user` and `admin` may bypass entitlement in explicitly allowed builds;
- bypass must not be available to normal production users;
- local test trip mode remains separate from admin/test bypass.

Acceptance:

- premium user can start recording;
- unpaid user can create exactly one local test trip with up to three photos;
- unpaid user cannot start another trip after the local test trip is used;
- paid user can record offline within policy;
- expired entitlement blocks premium actions after verified expiry/refresh;
- app outage/backend outage does not immediately lock a valid StoreKit subscriber;
- test/admin bypass works only where explicitly allowed.

Verification completed on an iPhone preview build:

- a normal unpaid account claimed one backend-recorded local test trip;
- the test trip saved at most three photos and rejected a waypoint containing
  more than three photos;
- deleting or finishing the test trip did not restore the allowance;
- sync and restore were rejected with a user-facing Premium message;
- an active sandbox monthly subscription allowed recording and more than three
  photos even after the test allowance was marked as used;
- cached verified Premium allowed a new local recording while the device was
  offline;
- after sandbox cancellation and verified expiration, the account returned to
  demo access and a used test allowance blocked another trip;
- `admin` and `test_user` bypass was confirmed in the preview build, and a role
  change required a new login as expected.

---

## Phase 9: Backend Entitlement Enforcement

Status: Done

Backend must enforce entitlement for cloud operations:

- trip sync/upload;
- image presign;
- image upload completion;
- restore/list trips;
- sharing;
- group sync where applicable;
- web access where applicable.

Reasons:

- old app versions must not bypass premium by calling APIs directly;
- server costs are tied to cloud operations;
- backend is the authority for cloud access.

Use:

```http
403 Forbidden
```

Recommended response:

```json
{
  "code": "PREMIUM_ENTITLEMENT_REQUIRED",
  "message": "An active Premium entitlement is required."
}
```

For local test trip failures, use distinct codes:

```json
{
  "code": "LOCAL_TEST_TRIP_ALREADY_USED",
  "message": "Premium is required to record another trip."
}
```

Rules:

- entitlement guards must use the centralized entitlement service;
- controllers must not duplicate plan-code checks;
- admin/test bypass must be centralized and auditable;
- expired/revoked subscriptions fail immediately for cloud actions;
- canceled-but-active subscriptions continue until `expiresAt`.

Acceptance:

- non-premium user receives stable 403/domain code;
- premium user succeeds;
- expired/revoked user is denied;
- canceled-but-not-expired user succeeds until expiration;
- test/admin users bypass only where intended.

Verification completed against the deployed AWS backend:

- an authenticated unpaid user received HTTP `403` with
  `PREMIUM_ENTITLEMENT_REQUIRED` from the trips API;
- an active Premium entitlement received HTTP `200` from the same endpoint;
- a canceled entitlement remained accepted before `currentPeriodEndsAt`;
- the same entitlement was denied immediately after its period ended and was
  normalized to `expired` by the backend;
- an admin user without `ENABLE_PURCHASE_TEST_ROLE_BYPASS=true` was denied,
  confirming that role alone cannot bypass production enforcement;
- unit and controller tests cover unpaid, active, canceled, expired, revoked and
  explicitly enabled role-bypass paths.

---

## Phase 10: UI/UX

Status: In progress

Add paywall entry points:

- login success if entitlement/pre-purchase state requires it;
- recording screen before a blocked start;
- settings/account panel;
- failed gated-action fallback;
- subscription status panel.

Paywall content:

- value proposition;
- monthly option;
- yearly option;
- StoreKit-localized price;
- localized billing period;
- auto-renewal disclosure;
- restore purchases button;
- Terms of Use link;
- Privacy Policy link;
- loading state;
- purchase pending state;
- verification pending state;
- error states.

Settings/account content:

- current plan;
- current subscription state;
- renewal/expiry information where available;
- restore purchases;
- manage subscription link;
- support path for ownership conflicts.

Rules:

- do not hardcode production prices;
- do not claim a trial unless configured in App Store Connect;
- do not show lifetime product;
- no fake purchase UI in production;
- user must understand whether a canceled subscription remains active until the
  end of the billing period.

Acceptance:

- purchase can be initiated from the blocked action;
- restore is visible and functional;
- localized prices display correctly;
- user sees pending verification state;
- subscription state is understandable;
- terms/privacy links work.

Implementation completed locally:

- blocked recording, waypoint photo, sync, restore, group, shared-trip and share
  actions offer a direct `View Premium` path;
- OAuth login opens Premium only when the local test trip was already consumed
  and there is no active Premium entitlement;
- purchase and restore outcomes are shown inline instead of opening an
  unsolicited dialog when the Premium screen appears;
- active, canceled, grace-period, billing-retry, expired and revoked states have
  user-facing descriptions, including the verified period end where available;
- monthly/yearly prices, billing periods and introductory offer text come from
  StoreKit product metadata;
- manage subscription, restore, ownership-conflict support, Terms of Use and
  Privacy Policy actions are present;
- public `/terms` and `/privacy` web pages are implemented and pass the Next.js
  production build.

Device verification is still required before marking this phase done.

---

## Phase 11: StoreKit Local Testing

Before App Store sandbox testing, use local StoreKit configuration where useful.

Test:

- monthly purchase;
- yearly purchase;
- purchase cancellation;
- failed purchase;
- interrupted purchase;
- renewal simulation;
- expiration simulation;
- refund/revocation simulation where supported;
- unfinished transaction recovery;
- restore flow;
- app relaunch;
- offline local entitlement behavior.

Rules:

- local StoreKit testing does not replace App Store sandbox;
- backend verification tests still require Apple sandbox/server integration where
  real server verification is involved;
- fake purchase provider remains separate from StoreKit testing.

Acceptance:

- mobile purchase state machine works before external sandbox dependencies;
- UI handles all basic purchase outcomes;
- unfinished transactions survive relaunch;
- no fake provider code leaks into Apple production flow.

---

## Phase 12: Sandbox and TestFlight QA

Test with Apple sandbox/TestFlight accounts:

- new monthly purchase;
- new yearly purchase;
- user-canceled purchase;
- failed purchase;
- restore purchase;
- reinstall then restore;
- subscription renewal;
- auto-renew disabled;
- billing retry;
- grace period;
- expired subscription;
- refund;
- revocation;
- offline entitlement policy;
- backend outage after successful purchase;
- duplicate backend verification;
- duplicate notification;
- notification history recovery;
- Trailbook account switching;
- ownership conflict;
- app update from fake-provider development build.

Regression test:

- Google login still works;
- Apple login still works;
- recording works for entitled user;
- selected local test trip behavior works;
- sync/restore/images work for entitled user;
- public sharing works;
- AWS S3/RDS/ECS integration remains functional;
- no fake purchase controls appear.

Acceptance:

- all lifecycle transitions produce correct backend status;
- mobile and backend converge on the same entitlement state;
- notifications update state without requiring app launch;
- restore after reinstall works;
- ownership conflicts are safely handled.

---

## Phase 13: Production Readiness

Before production:

- App Store products are configured and ready for review;
- App Store Server API credentials are configured;
- production notification URL is configured;
- sandbox notification URL is configured where appropriate;
- Apple test notification succeeds;
- production backend supports sandbox and production verification;
- production EAS environment disables fake purchases;
- all Apple secrets are stored in AWS-managed secret storage;
- App Review metadata explains subscription behavior;
- paywall review screenshot is uploaded;
- privacy policy mentions subscriptions/purchases;
- Terms of Use link is available;
- restore purchases is visible;
- manage subscription path is available;
- entitlement guards are enabled;
- admin/test bypass is unavailable to normal users;
- CloudWatch logs/alarms cover purchase verification and notifications.

Production env:

```text
PURCHASE_PROVIDER_MODE=apple

APPLE_APP_STORE_DEFAULT_ENVIRONMENT=production
APPLE_APP_STORE_ALLOW_SANDBOX=true
APPLE_APP_STORE_ALLOW_PRODUCTION=true

ENABLE_FAKE_PURCHASES=false
DISABLE_PURCHASE_ENTITLEMENT_ENFORCEMENT=false
```

Acceptance:

- no fake purchase controls in production;
- no normal-user entitlement bypass;
- backend and mobile agree on entitlement;
- App Store Server Notifications update lifecycle;
- production backend can process App Review/TestFlight sandbox purchases;
- App Review can test purchases using clear reviewer notes;
- failure alerts exist for Apple verification/notification processing.

---

## Data Model Requirements

At minimum retain:

### Store Product Mapping

```text
provider
provider_product_id
internal_product_code
plan_id
billing_type
active
```

### Purchase Transaction History

```text
user_id
provider
environment
transaction_id
original_transaction_id
app_account_token
product_id
event_type
purchase_result
purchased_at
expires_at
revoked_at
raw_payload
processed_at
idempotency_key
```

### Subscription/Access State

```text
user_id
provider
environment
original_transaction_id
product_id
subscription_status
auto_renew_enabled
expires_at
revoked_at
last_verified_at
```

### Notification Audit

```text
provider_notification_id
notification_type
notification_subtype
environment
received_at
processed_at
processing_status
raw_signed_payload
error_message
```

Constraints:

```text
(provider, transaction_id) unique
(provider, provider_notification_id) unique
(provider, original_transaction_id) ownership-aware unique/index
```

---

## Security Requirements

- App Store private key remains backend-only.
- StoreKit result must be verified before local fallback is accepted.
- Backend validates bundle ID and configured product IDs.
- Backend validates `appAccountToken`.
- Notification endpoint verifies Apple signature/certificate chain.
- Notification endpoint is rate-limited carefully without blocking Apple.
- Raw payload logs must avoid unrelated authentication/session secrets.
- Apple secrets are stored in AWS Secrets Manager or SSM SecureString.
- ECS task execution role may read only required purchase secrets.
- Normal mobile configuration contains no Apple server private key.
- Test/admin bypass is disabled for normal production users.
- Purchase verification and notification processing are idempotent.

---

## Observability

Structured logs should include:

- provider;
- environment;
- event type;
- transaction ID;
- original transaction ID;
- notification identifier;
- internal user ID;
- product ID;
- processing result;
- error category.

Do not log:

- private key;
- full user authentication tokens;
- unrelated personally identifying information.

Recommended metrics/alarms:

- verification failures;
- notification signature failures;
- notification processing failures;
- unknown product IDs;
- ownership conflicts;
- stale subscription refreshes;
- high notification retry count;
- purchase pending too long.

---

## Backend Error Codes

Recommended stable domain codes:

```text
PREMIUM_ENTITLEMENT_REQUIRED
APPLE_TRANSACTION_INVALID
APPLE_PRODUCT_NOT_ALLOWED
APPLE_BUNDLE_MISMATCH
APPLE_ENVIRONMENT_MISMATCH
APPLE_ACCOUNT_TOKEN_MISMATCH
APPLE_PURCHASE_ALREADY_LINKED_TO_ANOTHER_ACCOUNT
APPLE_PURCHASE_VERIFICATION_PENDING
APPLE_PURCHASE_VERIFICATION_FAILED
APPLE_NOTIFICATION_INVALID
APPLE_SUBSCRIPTION_EXPIRED
APPLE_PURCHASE_REVOKED
DEMO_TRIP_LIMIT_REACHED
DEMO_PHOTO_LIMIT_REACHED
```

HTTP guidance:

```text
400 -> malformed request
401 -> unauthenticated Trailbook request
403 -> authenticated user lacks entitlement / ownership
409 -> ownership/account-link conflict
422 -> valid request shape but invalid Apple transaction state
503 -> Apple/backend verification temporarily unavailable
```

---

## Suggested Implementation Order

1. Finalize local test trip/paywall model.
2. Finalize product IDs and subscription group.
3. Confirm existing fake-provider domain types can support Apple.
4. Add Apple purchase/account-binding fields to the data model.
5. Add normalized Apple purchase event types.
6. Implement backend Apple JWS verification foundation.
7. Implement App Store Server API transaction verification.
8. Implement `appAccountToken` generation and validation.
9. Implement purchase ownership binding.
10. Implement `/api/purchases/apple/verify`.
11. Implement App Store Server Notifications V2 endpoint.
12. Implement notification audit/idempotency/replay.
13. Configure App Store Connect products.
14. Configure Apple notification URLs.
15. Integrate `expo-iap`.
16. Add StoreKit product loading and localized paywall.
17. Add purchase listener and transaction processing.
18. Add unfinished transaction recovery.
19. Add restore/reconciliation flow.
20. Add local verified entitlement cache.
21. Add offline access policy.
22. Add mobile entitlement/local-test-trip gates.
23. Add backend cloud entitlement guards.
24. Add subscription status/manage-subscription UI.
25. Run StoreKit local tests.
26. Run Apple sandbox/TestFlight tests.
27. Validate renewal/refund/revocation notification flows.
28. Disable fake provider in production.
29. Complete App Store review metadata.
30. Proceed to separate App Store release plan.

---

## Open Questions

- Should sample/demo content be added later for App Store screenshots or product education?
- Exact monthly and yearly prices?
- How long should raw Apple notification payloads be retained?
- Should sandbox and production notifications share one endpoint?
- Should App Store review use the production backend with sandbox allowed?
- Which subscription management information should be shown inside the app?
- Will RevenueCat remain only a fallback, or should a migration threshold be documented?

---

## Acceptance Criteria

- Monthly and yearly Apple products load from StoreKit.
- Production UI uses StoreKit-localized prices.
- New purchase sends `appAccountToken`.
- Backend verifies Apple-signed transaction data.
- Backend validates bundle ID, product ID, environment and account token.
- Historical valid transaction does not incorrectly grant active entitlement.
- App Store Server Notifications V2 update subscription lifecycle.
- Renewal extends access.
- canceled auto-renew preserves access until expiration.
- billing retry/grace state is represented correctly.
- expiration removes entitlement.
- refund/revocation removes entitlement.
- notification processing is idempotent.
- missed notifications can be recovered.
- unfinished transactions recover after app restart.
- transaction is finished only after backend persistence.
- restore after reinstall works.
- restore does not silently unlock a second unrelated Trailbook account.
- cloud actions require backend entitlement.
- local offline use follows verified entitlement policy.
- local test trip behavior follows the selected product model.
- fake purchase controls are absent from production.
- test/admin bypass is unavailable to normal users.
- mobile and backend converge on the same entitlement state.
- App Review can test the purchase flow with clear reviewer notes.
