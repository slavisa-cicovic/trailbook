# PLAN 65A: Purchase Backend Fake Provider

## Goal

Implement the backend foundation for provider-neutral purchases using a local
fake provider.

This is the first execution slice of `PLAN_65_purchase_provider_simulation.md`.
It must make purchase state testable without Apple/Google credentials and
without mobile native billing libraries.

## Scope

Backend only.

Included:

- purchase provider/domain enums
- normalized purchase event types
- provider/product mapping
- purchase transaction history
- minimal entitlement state
- fake provider
- purchase application service
- backend purchase APIs
- backend tests

Not included:

- mobile purchase UI
- mobile fake provider
- paywall enforcement across existing product flows
- Apple App Store integration
- Google Play Billing integration
- web billing

## Required Domain Decisions

### Demo Is Not A Subscription Status

Do not add `demo` to `SubscriptionStatus`.

Demo/basic access should be represented as:

- a plan/access mode, or
- derived demo entitlements, or
- existing demo session behavior

Billing status should remain billing-related.

### Provider Adapter Does Not Update State

Provider adapters return normalized events.

Only `PurchaseApplicationService.applyNormalizedEvent(...)` may update:

- purchase transaction history
- subscription state
- entitlement state

### Provider Adapter Does Not Own Product Mapping

Provider adapters should return provider identifiers and provider facts.

`PurchaseApplicationService` maps:

```text
provider + provider_product_id -> internal product -> plan -> entitlements
```

This keeps fake, Apple and Google adapters thin.

## Backend Schema

Add tables using both Prisma schema and `server/db/init.sql`.

### `store_products`

Fields:

- `id`
- `plan_id`
- `provider` (`fake`, `apple`, `google`)
- `provider_product_id`
- `internal_product_code`
- `billing_type`
- `active`
- `created_at`
- `updated_at`

Constraints:

- unique `(provider, provider_product_id)`
- index `plan_id`

### `purchase_transactions`

Append-only normalized transaction/event history.

Fields:

- `id`
- `user_id`
- `subscription_id` nullable
- `provider`
- `environment` (`local`, `sandbox`, `production`)
- `provider_transaction_id`
- `provider_original_transaction_id` nullable
- `provider_product_id`
- `internal_product_code`
- `event_type`
- `purchase_result`
- `subscription_status_after_event`
- `purchased_at` nullable
- `expires_at` nullable
- `revoked_at` nullable
- `processed_at`
- `idempotency_key`
- `raw_payload_json`
- `created_at`

Constraints:

- unique `(provider, provider_transaction_id)`
- unique `idempotency_key`
- index `(user_id, created_at)`
- index `(provider, provider_original_transaction_id)`

### `user_entitlements`

Minimal entitlement state.

Fields:

- `id`
- `user_id`
- `entitlement_code`
- `source_type` (`subscription`, `manual_grant`, `demo`)
- `source_id` nullable
- `active`
- `starts_at`
- `expires_at` nullable
- `revoked_at` nullable
- `created_at`
- `updated_at`

Indexes:

- `(user_id, entitlement_code)`
- partial unique active entitlement if practical:
  `(user_id, entitlement_code) WHERE active = true`

If partial unique indexes are awkward in Prisma, create it in `db/init.sql` and
document it in the Prisma model comment.

## Domain Types

Create backend purchase domain types near `server/src/purchases`.

Required enums:

- `PurchaseProvider`: `fake | apple | google`
- `PurchaseEnvironment`: `local | sandbox | production`
- `PurchaseEventType`: `PURCHASED | RENEWED | CANCELED | EXPIRED | REFUNDED | REVOKED | DECLINED | PENDING | RESTORED`
- `PurchaseResult`: `success | canceled_by_user | declined | pending | failed`

Normalized event shape:

```ts
interface NormalizedPurchaseEvent {
  provider: PurchaseProvider;
  environment: PurchaseEnvironment;
  eventType: PurchaseEventType;
  userId?: string;
  providerProductId: string;
  providerTransactionId: string;
  providerOriginalTransactionId?: string;
  purchasedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  idempotencyKey: string;
  rawPayload: unknown;
}
```

`userId` is optional because real provider notifications may be correlated by
transaction/original transaction id rather than user id.

## Purchase Provider Boundary

Create `PurchaseProvider` interface:

```ts
interface PurchaseProvider {
  provider: "fake" | "apple" | "google";

  listProducts(input: {
    userId: string;
    platform?: "ios" | "android" | "web";
  }): Promise<PurchaseProduct[]>;

  completePurchase(input: {
    userId: string;
    providerProductId: string;
    purchaseToken?: string;
    transactionId?: string;
    scenario?: FakePurchaseScenario;
  }): Promise<NormalizedPurchaseEvent>;

  refreshSubscription(input: {
    userId?: string;
    subscriptionId?: string;
    providerOriginalTransactionId?: string;
  }): Promise<NormalizedPurchaseEvent[]>;
}
```

## Fake Provider

Implement `FakePurchaseProvider` scenarios:

- `success`
- `renew`
- `subscription_canceled`
- `expired`
- `refund`
- `revoke`
- `decline`
- `cancel`
- `pending`
- `restore`

Rules:

- `cancel` means user canceled checkout; it should not activate subscription.
- `decline` writes a declined event but grants no access.
- `pending` writes pending state and grants no paid entitlements.
- `subscription_canceled` keeps access until period end.
- `expired`, `refund`, `revoke` remove paid entitlements.

## Purchase Application Service

Implement one service path for state application:

```ts
class PurchaseApplicationService {
  listProducts(...);
  getCurrentAccess(...);
  simulateFakePurchase(...);
  applyNormalizedEvent(...);
}
```

Responsibilities:

- validate authenticated user
- validate fake purchases are enabled
- enforce test-user/admin capability for fake simulation when configured
- map provider product to internal plan
- apply normalized event idempotently
- create purchase transaction row
- create/update subscription row
- recalculate user entitlements
- return current access

## Backend APIs

Create `PurchasesModule` and `PurchasesController`.

Endpoints:

```http
GET /api/purchases/products?provider=fake
GET /api/purchases/me
POST /api/purchases/fake/simulate
```

`POST /api/purchases/fake/simulate` is allowed only when:

- fake purchases are enabled by env, and
- environment is safe or user has explicit test/admin access

## Environment

Add to `server/.env.example`:

```text
PURCHASE_PROVIDER_MODE=fake
ENABLE_FAKE_PURCHASES=false
PURCHASE_ENVIRONMENT=local
```

Implementation should default to safe values:

- fake disabled unless explicitly enabled
- production rejects fake simulation by default

## Tests

Backend unit tests:

- fake provider creates normalized `PURCHASED`
- monthly purchase activates subscription and entitlements
- yearly purchase activates subscription and entitlements
- lifetime purchase grants lifetime access if enabled
- renew extends period
- canceled keeps access until period end
- expired removes paid entitlements
- refund/revoke remove paid entitlements
- declined/pending grant no paid entitlement
- duplicate idempotency key is idempotent
- fake provider is rejected when disabled

Backend integration tests:

- authenticated user can list products
- authenticated test user can simulate fake purchase
- normal user cannot simulate fake purchase when not allowed
- `/api/purchases/me` reflects current access

## Manual Verification

1. Start server with fake purchases enabled.
2. Login as test user.
3. Call `GET /api/purchases/products?provider=fake`.
4. Simulate monthly purchase.
5. Confirm `/api/purchases/me` returns active access and entitlements.
6. Simulate renew.
7. Simulate cancel/expire/refund/revoke.
8. Confirm access state changes correctly.

## Acceptance Criteria

- Fake purchase scenarios update backend subscription/access state.
- All state changes pass through `PurchaseApplicationService.applyNormalizedEvent`.
- Purchase transactions are append-only and idempotent.
- `/api/purchases/me` is the backend source of truth for access.
- Fake endpoints are disabled by default and server-guarded.
- Existing auth, sync, recording and media behavior is unchanged.
