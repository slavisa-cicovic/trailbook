# PLAN 65: Purchase Provider Simulation

## Goal

Introduce a provider-neutral purchase/subscription architecture for Trailbook.

The first implementation must allow local simulation of purchase flows before
integrating Apple App Store and Google Play Billing.

The fake provider must not try to fully emulate Apple or Google. Instead, it
must produce the same normalized internal purchase events that real Apple/Google
providers will later produce.

The goal is to make billing, subscription state, and entitlements testable before
using real store credentials, sandbox users, App Store Server API, or Google Play
Developer API.

---

## Context

Trailbook currently has a minimal commercial foundation:

- `plans`
- `subscriptions`
- `PlanBillingType`
- `SubscriptionStatus`

Today this is used mainly as a demo/basic access record during registration.

Missing pieces:

- no mobile purchase UI
- no provider/product mapping
- no purchase transaction history
- no receipt/token verification
- no provider notification/webhook handling
- no normalized purchase event model
- no proper entitlement derivation layer

---

## Key Decision

Do not make the app/backend depend directly on Apple or Google billing APIs.

Introduce two boundaries:

1. Backend `PurchaseProvider`
2. Mobile `MobilePurchaseProvider`

Initial implementation:

- `FakePurchaseProvider`
- `FakeMobilePurchaseProvider`

Future implementations:

- `ApplePurchaseProvider`
- `GooglePurchaseProvider`
- `AppleMobilePurchaseProvider`
- `GoogleMobilePurchaseProvider`

Apple integration will later use App Store Server API and App Store Server
Notifications V2.

Google integration will later use Google Play Billing, Play Developer API, and
Real-time Developer Notifications.

---

## Non-Goals

This plan does not include:

- real Apple credentials
- real Google credentials
- App Store Connect setup
- Play Console setup
- real receipt verification
- real purchase token verification
- real App Store notifications
- real Google RTDN handling
- web billing
- full paywall rollout across all product areas
- migration/removal of the existing demo/basic subscription behavior

This plan should prepare the architecture, not complete real store integration.

---

## Product Assumptions

Trailbook commercial model:

- `demo`
- `premium_monthly`
- `premium_yearly`
- optional `lifetime`
- possible future `premium_plus` / `web_access`

Current demo rules:

- demo user can create up to 5 trips per month
- demo trip can have up to 5 photos
- demo user has no sync
- demo user has no web access
- demo data stays local on the device

Paid access should eventually unlock:

- sync
- sharing
- photo storage
- cloud backup
- possibly web access
- possibly advanced diagnostics/reprocessing later

---

## Provider Concepts

Supported providers:

```text
fake
apple
google
```

Provider meanings:

- `fake` -> local simulation only
- `apple` -> App Store / StoreKit / App Store Server API
- `google` -> Google Play Billing / Play Developer API / RTDN

The rest of the backend should not care which provider produced the purchase
event. Provider adapters should normalize external provider data into internal
purchase events.

---

## Product Concepts

The server owns canonical product/plan mapping.

Example internal product ids:

```text
trailbook_premium_monthly
trailbook_premium_yearly
trailbook_lifetime
```

Future possible products:

```text
trailbook_plus_monthly
trailbook_plus_yearly
```

Mapping:

```text
provider + provider_product_id
    -> internal product
    -> plan
    -> billing type
    -> entitlement set
```

Example entitlements:

```text
sync
sharing
photo_storage
web_access
raw_reprocessing
advanced_diagnostics
```

---

## Core Architecture Rule

Provider adapters must not directly update subscription/entitlement state.

Provider adapters should return normalized events.

```text
FakePurchaseProvider
ApplePurchaseProvider
GooglePurchaseProvider
        ↓
NormalizedPurchaseEvent
        ↓
PurchaseApplicationService
        ↓
purchase transaction history
subscription state
entitlement derivation
```

This keeps Apple, Google, and fake logic outside the core domain update rules.

---

## Backend Domain Model

### `store_products`

Maps Trailbook plans/products to provider-specific product identifiers.

Fields:

```text
id
plan_id
provider                    fake | apple | google
provider_product_id
internal_product_code
billing_type                monthly | yearly | lifetime
active
created_at
updated_at
```

Unique constraints:

```text
(provider, provider_product_id)
```

Notes:

- fake products should be seeded for local/test environments
- Apple/Google products are added later
- server owns this mapping
- mobile must not hardcode plan/entitlement mapping

---

### `purchase_transactions`

Append-only provider transaction history.

Fields:

```text
id
user_id
subscription_id nullable
provider                    fake | apple | google
environment                 local | sandbox | production
provider_transaction_id
provider_original_transaction_id nullable
provider_product_id
internal_product_code
event_type
purchase_result
subscription_status_after_event
purchased_at nullable
expires_at nullable
revoked_at nullable
processed_at
idempotency_key
raw_payload_json
created_at
```

Unique constraints:

```text
(provider, provider_transaction_id)
```

Recommended additional indexes:

```text
(user_id, created_at)
(provider, provider_original_transaction_id)
```

Notes:

- this table is append-only
- do not edit old rows to “fix” subscription state
- insert a compensating event instead
- `raw_payload_json` stores the normalized/fake payload now and real provider
  payload later

---

### `purchase_events`

Optional follow-up table.

Only add this if `purchase_transactions.raw_payload_json` is not enough for
debugging, notification replay, or audit.

Possible fields:

```text
id
provider
environment
event_id
event_type
received_at
processed_at
processing_status
raw_payload_json
error_message
```

Do not add this table in the first slice unless implementation needs it.

---

### `user_entitlements`

Recommended to add early, even if initially simple.

Fields:

```text
id
user_id
entitlement_code
source_type                 subscription | manual_grant | demo
source_id nullable
active
starts_at
expires_at nullable
revoked_at nullable
created_at
updated_at
```

Conceptual unique active constraint:

```text
(user_id, entitlement_code, active)
```

Example entitlement codes:

```text
sync
sharing
photo_storage
web_access
advanced_diagnostics
```

Notes:

- subscriptions are billing state
- entitlements are product access state
- UI and API authorization should check entitlements, not raw billing rows
- demo access can remain special initially, but paid features should move toward
  entitlement checks

---

### `manual_entitlement_grants`

Optional but strongly recommended before admin tooling.

Purpose:

- test users
- support grants
- temporary access
- special cases such as selected web users

Fields:

```text
id
user_id
entitlement_code
reason
granted_by_user_id
starts_at
expires_at nullable
revoked_at nullable
created_at
updated_at
```

Rules:

- manual grants must not pretend to be Apple/Google purchases
- manual grants must be visible/auditable
- admin must not directly edit `subscriptions` from monthly to yearly

---

## Enums

### `PurchaseProvider`

```text
fake
apple
google
```

### `PurchaseEnvironment`

```text
local
sandbox
production
```

### `PurchaseEventType`

```text
PURCHASED
RENEWED
CANCELED
EXPIRED
REFUNDED
REVOKED
DECLINED
PENDING
RESTORED
```

### `PurchaseResult`

```text
success
canceled_by_user
declined
pending
failed
```

### `SubscriptionStatus`

Recommended expanded values:

```text
demo
pending
active
in_grace_period
on_hold
canceled
expired
revoked
lifetime
```

The UI does not need to expose all of these immediately.

For V1 UI, collapse to:

```text
active
inactive
lifetime
```

---

## Normalized Purchase Event

Provider adapters should output this shape or something very close to it:

```ts
type PurchaseProviderName = "fake" | "apple" | "google";

type PurchaseEnvironment = "local" | "sandbox" | "production";

type PurchaseEventType =
  | "PURCHASED"
  | "RENEWED"
  | "CANCELED"
  | "EXPIRED"
  | "REFUNDED"
  | "REVOKED"
  | "DECLINED"
  | "PENDING"
  | "RESTORED";

interface NormalizedPurchaseEvent {
  provider: PurchaseProviderName;
  environment: PurchaseEnvironment;

  eventType: PurchaseEventType;

  userId: string;
  providerProductId: string;
  internalProductCode: string;

  providerTransactionId: string;
  providerOriginalTransactionId?: string;

  purchasedAt?: string;
  expiresAt?: string;
  revokedAt?: string;

  idempotencyKey: string;

  rawPayload: unknown;
}
```

The fake provider should create deterministic normalized events.

Apple/Google providers later should translate store-specific responses and
notifications into this same internal shape.

---

## Backend Provider Boundary

```ts
interface PurchaseProvider {
  provider: "fake" | "apple" | "google";

  listProducts(input: {
    userId: string;
    platform?: "ios" | "android" | "web";
  }): Promise<PurchaseProduct[]>;

  startPurchase?(input: {
    userId: string;
    providerProductId: string;
  }): Promise<PurchaseStartResult>;

  completePurchase(input: {
    userId: string;
    providerProductId: string;
    purchaseToken?: string;
    transactionId?: string;
    scenario?: FakePurchaseScenario;
  }): Promise<NormalizedPurchaseEvent>;

  refreshSubscription(input: {
    userId: string;
    subscriptionId?: string;
    providerOriginalTransactionId?: string;
  }): Promise<NormalizedPurchaseEvent[]>;
}
```

Notes:

- `startPurchase` is optional because real mobile purchases mostly start on the
  device through native billing APIs
- fake provider may skip native purchase and directly return a normalized event
- real providers should verify store data server-side

---

## Purchase Application Service

Add a provider-neutral service:

```ts
class PurchaseApplicationService {
  listProducts(...);
  simulateFakePurchase(...);
  verifyProviderPurchase(...);
  handleProviderNotification(...);
  refreshCurrentAccess(...);
  applyNormalizedEvent(...);
}
```

Responsibilities:

- validate user
- validate product mapping
- call provider adapter
- apply normalized event idempotently
- write purchase transaction history
- update subscription state
- recalculate entitlements
- return current access

Rules:

- one service path must update subscription/entitlement state
- fake and real providers must go through the same state application path
- duplicate provider transaction/event must be idempotent
- never trust client-only access state

---

## Backend API

### Products

```http
GET /api/purchases/products?provider=fake
```

or provider can be derived from platform/config.

Response:

```ts
{
  products: Array<{
    productId: string;
    provider: "fake" | "apple" | "google";
    title: string;
    description: string;
    billingType: "monthly" | "yearly" | "lifetime";
    priceLabel: string;
    planCode: string;
    entitlements: string[];
  }>;
}
```

Notes:

- server returns products that are valid for the current provider/platform
- mobile UI should display products from this API or from native store metadata
  later, but entitlement mapping remains server-owned

---

### Current Access

```http
GET /api/purchases/me
```

Response:

```ts
{
  subscriptionStatus:
    | "demo"
    | "pending"
    | "active"
    | "in_grace_period"
    | "on_hold"
    | "canceled"
    | "expired"
    | "revoked"
    | "lifetime";

  planCode: string;
  currentPeriodEndsAt: string | null;

  entitlements: string[];

  provider?: "fake" | "apple" | "google";
  environment?: "local" | "sandbox" | "production";
}
```

This endpoint should be the main source of truth for mobile/web access UI.

---

### Fake Purchase Simulation

Only enabled in safe environments or for explicitly allowed users.

```http
POST /api/purchases/fake/simulate
```

Input:

```ts
{
  productId: string;
  scenario:
    | "success"
    | "cancel"
    | "decline"
    | "pending"
    | "expired"
    | "subscription_canceled"
    | "refund"
    | "revoke"
    | "renew";
}
```

Output:

```ts
{
  purchaseResult: "success" | "canceled_by_user" | "declined" | "pending" | "failed";
  subscriptionStatus: string;
  planCode: string;
  currentPeriodEndsAt: string | null;
  entitlements: string[];
}
```

Important:

- endpoint name should be `simulate`, not `complete`
- fake purchase should still create normalized events
- fake purchase should still go through `applyNormalizedEvent`

---

### Real Provider Completion Later

Reserved future endpoint:

```http
POST /api/purchases/verify
```

Input:

```ts
{
  provider: "apple" | "google";
  productId: string;
  transactionId?: string;
  purchaseToken?: string;
}
```

This endpoint is out of scope for this plan, but the architecture should allow
it without changing the subscription state application layer.

---

### Real Provider Notifications Later

Reserved future endpoints:

```http
POST /api/purchases/apple/notifications
POST /api/purchases/google/notifications
```

These are provider-specific because Apple and Google notification payloads and
security models differ.

---

## Fake Provider Behavior

Fake provider must support deterministic local scenarios:

```text
success monthly subscription
success yearly subscription
lifetime purchase
user canceled purchase
payment declined
pending payment
subscription renewed
subscription expired
subscription canceled
refund
revocation
restore purchases
```

Scenario behavior:

### `success`

- create `PURCHASED`
- create/activate subscription
- derive entitlements
- return active access

### `renew`

- create `RENEWED`
- extend `expires_at`
- keep entitlements active

### `subscription_canceled`

- create `CANCELED`
- subscription may remain active until period end
- entitlements remain active until `expires_at`

### `expired`

- create `EXPIRED`
- subscription becomes expired
- paid entitlements removed

### `refund`

- create `REFUNDED`
- subscription becomes revoked or expired depending on implementation
- paid entitlements removed

### `revoke`

- create `REVOKED`
- access removed immediately

### `decline`

- create `DECLINED`
- do not activate subscription
- do not grant entitlements

### `cancel`

- simulate user canceled checkout
- do not activate subscription
- may or may not write transaction depending on desired audit behavior

### `pending`

- create `PENDING`
- subscription status becomes pending
- do not grant paid entitlements until resolved

---

## Mobile Purchase Boundary

Add a mobile-side abstraction:

```ts
interface MobilePurchaseProvider {
  listProducts(): Promise<PurchaseProduct[]>;
  purchase(productId: string): Promise<PurchaseResult>;
  restorePurchases(): Promise<PurchaseAccess>;
  refreshAccess(): Promise<PurchaseAccess>;
}
```

Implementations:

```text
FakeMobilePurchaseProvider
AppleMobilePurchaseProvider later
GoogleMobilePurchaseProvider later
```

Rules:

- UI must depend on `MobilePurchaseProvider`
- UI must not call fake endpoints directly across random screens
- provider selection must be centralized
- `refreshAccess` should call backend `/api/purchases/me`

---

## Mobile Simulation UI

Add a gated debug/settings screen:

```text
Settings -> Purchases simulation
```

Visible only when:

```text
__DEV__ === true
```

or server confirms:

```text
user role/capability = test_user
```

UI should show:

- current access
- available fake products
- current subscription status
- current entitlements
- fake scenario buttons:
  - buy monthly
  - buy yearly
  - buy lifetime
  - renew
  - expire
  - cancel subscription
  - refund
  - revoke
  - pending
  - restore purchases

This screen is for development and QA only.

---

## Release Safety

Fake purchase paths must never be available to normal production users.

Rules:

- backend rejects fake purchase requests unless fake purchases are enabled
- backend also requires server-side user role/capability
- mobile `__DEV__` is not enough
- fake UI hidden unless dev/test user
- fake provider disabled by default
- no Apple/Google secrets in mobile config
- no provider raw payloads should include auth session tokens
- production builds must not show fake simulation UI

Recommended backend guard:

```text
ENABLE_FAKE_PURCHASES=true
NODE_ENV != production
OR user has explicit test_user/admin capability
```

If fake purchases are ever enabled against a deployed environment, access must be
limited to explicitly whitelisted test users.

---

## Suggested Environment Variables

Backend local:

```text
PURCHASE_PROVIDER_MODE=fake
ENABLE_FAKE_PURCHASES=true
APPLE_PURCHASES_ENABLED=false
GOOGLE_PURCHASES_ENABLED=false
PURCHASE_ENVIRONMENT=local
```

Backend production later:

```text
PURCHASE_PROVIDER_MODE=native
ENABLE_FAKE_PURCHASES=false
APPLE_PURCHASES_ENABLED=true
GOOGLE_PURCHASES_ENABLED=true
PURCHASE_ENVIRONMENT=production
```

Mobile local:

```text
EXPO_PUBLIC_PURCHASE_PROVIDER=fake
```

Mobile production later:

```text
EXPO_PUBLIC_PURCHASE_PROVIDER=native
```

Exact variable names may change, but the distinction must remain explicit.

---

## Store Integration Notes

### Apple Later

Real Apple implementation will require:

- App Store Connect app record
- In-App Purchase products
- subscription groups if subscriptions are used
- StoreKit testing or sandbox users
- server-side transaction verification
- App Store Server API
- App Store Server Notifications V2
- privacy/account deletion compliance

### Google Later

Real Google implementation will require:

- Play Console app record
- Play Billing products/subscriptions
- Google Play Billing client on Android
- purchase token verification server-side
- Google Play Developer API
- Real-time Developer Notifications
- optional Play Integrity review later

---

## Tests

### Backend Unit Tests

- fake provider creates normalized `PURCHASED` event
- fake monthly purchase creates active subscription
- fake yearly purchase creates active subscription
- fake lifetime purchase creates lifetime access
- renew scenario extends subscription
- canceled scenario sets subscription canceled but keeps access until period end
- expired scenario removes paid entitlements
- refund scenario records transaction and removes entitlements
- revoke scenario removes access immediately
- declined scenario does not grant entitlements
- pending scenario does not grant paid entitlements
- duplicate provider transaction is idempotent
- fake provider rejected when disabled
- fake provider rejected for non-test user when required
- `/api/purchases/me` derives access from entitlements/subscription state

### Backend Integration Tests

- authenticated user can list purchase products
- authenticated test user can simulate fake purchase
- normal user cannot simulate fake purchase when not allowed
- normal production-like config rejects fake simulation
- purchase simulation updates `/api/purchases/me`
- expire/cancel/refund simulation updates access correctly

### Mobile Tests

- mobile selects fake provider in dev/test mode
- simulation screen is gated
- product list renders
- successful purchase refreshes access state
- declined purchase shows clear message
- expired/refunded access refresh removes paid UI access
- restore calls provider boundary
- UI does not call fake endpoint directly outside provider implementation

---

## Manual Verification

Local simulation flow:

1. Login as test user.
2. Open `Settings -> Purchases simulation`.
3. Confirm fake products are listed.
4. Buy monthly fake product.
5. Confirm backend writes purchase transaction.
6. Confirm `/api/purchases/me` returns active status.
7. Confirm expected entitlements are present.
8. Confirm app UI displays active access.
9. Trigger renew.
10. Confirm period end is extended.
11. Trigger subscription cancel.
12. Confirm access remains until period end if that is intended behavior.
13. Trigger expire.
14. Confirm paid access disappears.
15. Trigger refund/revoke.
16. Confirm paid access disappears immediately.
17. Login as normal user.
18. Confirm fake screen is hidden.
19. Confirm fake endpoint rejects normal user if called directly.

---

## Open Questions

- Which features are gated first?
  - sync?
  - sharing?
  - photo storage?
  - web access?

- Do we allow only one active paid plan at a time?

- Do we want lifetime in V1?

- Should lifetime unlock cloud-backed features forever, or only mobile-local
  premium features?

- Do we need trial periods later?

- Should demo accounts bypass all purchase checks permanently?

- Should admin/test access use `manual_entitlement_grants`?

- How will web access be represented?
  - entitlement only?
  - separate plan?
  - manual/admin grant in early version?

---

## Suggested Implementation Order

1. Add purchase provider/domain enums.
2. Add normalized purchase event types.
3. Add `store_products` table.
4. Add `purchase_transactions` table.
5. Add minimal `user_entitlements` table or entitlement read model.
6. Seed fake store products and plan mappings.
7. Implement `PurchaseProvider` interface.
8. Implement `FakePurchaseProvider`.
9. Implement `PurchaseApplicationService.applyNormalizedEvent`.
10. Implement `/api/purchases/products`.
11. Implement `/api/purchases/me`.
12. Implement `/api/purchases/fake/simulate`.
13. Add backend unit tests.
14. Add backend integration tests.
15. Add mobile `MobilePurchaseProvider` interface.
16. Implement `FakeMobilePurchaseProvider`.
17. Add gated purchase simulation screen.
18. Wire access refresh into session/settings UI.
19. Document Apple/Google sandbox setup as follow-up plan.
20. Keep existing auth, sync, recording, and media flows unchanged unless an
    explicit entitlement check is added.

---

## Acceptance Criteria

- Fake purchase flow can activate monthly access.
- Fake purchase flow can activate yearly access.
- Fake purchase flow can activate lifetime access if lifetime is included.
- Fake purchase flow can renew, cancel, expire, refund, and revoke access.
- Fake provider produces normalized purchase events.
- Subscription/entitlement state is updated through one provider-neutral service
  path.
- Duplicate fake transactions are idempotent.
- `/api/purchases/me` returns current access consistently.
- Mobile UI uses a provider boundary.
- Fake purchase UI is not visible to normal production users.
- Backend rejects fake purchase simulation unless explicitly allowed.
- Existing auth, sync, recording, and media flows remain unchanged unless paid
  entitlement checks are explicitly added.