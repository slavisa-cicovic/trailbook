# PLAN 65D: Apple Purchase Sandbox

## Goal

Add Apple App Store purchase support using sandbox/testing infrastructure while
preserving the provider-neutral backend from `PLAN_65A`.

This plan should not start until fake purchase simulation and entitlement
enforcement are stable enough to validate real Apple events against the same
state application path.

## Dependencies

- `PLAN_65A_purchase_backend_fake_provider.md`
- `PLAN_65B_mobile_purchase_simulation_ui.md`
- optionally `PLAN_65C_entitlement_enforcement.md`

## Scope

Apple-only.

Included:

- App Store Connect product setup checklist
- Apple product mapping in `store_products`
- mobile Apple purchase provider
- server-side Apple transaction verification
- sandbox purchase/restore testing
- App Store Server Notifications V2 preparation

Not included:

- Google Play Billing
- production rollout to all users
- broad paywall redesign
- web billing

## Apple Setup Requirements

Before implementation:

- App Store Connect app record exists.
- Bundle identifier matches production/staging iOS app.
- In-App Purchase products are created.
- Subscription group exists if using subscriptions.
- Sandbox tester accounts are available.
- Shared secret / App Store Server API credentials are available if required by
  chosen verification approach.
- Public backend URL exists for server notifications.

## Backend Work

### Product Mapping

Add Apple rows to `store_products`:

```text
provider=apple
provider_product_id=<App Store product id>
internal_product_code=...
plan_id=...
billing_type=...
active=true
```

### Apple Provider

Implement `ApplePurchaseProvider`.

Responsibilities:

- verify Apple transaction data server-side
- map Apple product id through `store_products`
- return `NormalizedPurchaseEvent`
- never update subscription/entitlement state directly

### Verification Endpoint

Add reserved endpoint:

```http
POST /api/purchases/verify
```

Input:

```ts
{
  provider: "apple";
  productId: string;
  transactionId?: string;
  purchaseToken?: string;
}
```

The endpoint should call the Apple provider, then
`PurchaseApplicationService.applyNormalizedEvent`.

### Notifications

Prepare:

```http
POST /api/purchases/apple/notifications
```

Apple notification payload validation and security requirements should be
implemented before production use.

In sandbox phase, this can be limited to logging/normalizing known notification
types if full production validation is not ready.

## Mobile Work

Add `AppleMobilePurchaseProvider`.

Responsibilities:

- load Apple products through a native IAP/StoreKit-compatible library
- start purchase on device
- send transaction identifier/token to backend verify endpoint
- refresh access via `/api/purchases/me`
- restore purchases

The UI should remain provider-neutral.

## Testing Strategy

### Local

- Keep fake provider tests as primary deterministic tests.
- Unit-test Apple provider normalization with recorded sandbox payload fixtures.

### Sandbox Manual

1. Build iOS app with Apple provider enabled.
2. Login as test user.
3. Load products.
4. Buy sandbox monthly subscription.
5. Verify backend creates purchase transaction.
6. Verify `/api/purchases/me` returns active entitlement.
7. Restore purchases.
8. Test subscription renewal/expiration in sandbox.
9. Test cancellation/refund/revocation if sandbox supports the scenario.

## Release Safety

- Apple provider only enabled for iOS builds.
- Fake provider remains disabled in production.
- Server must verify Apple state; mobile transaction state is not trusted.
- App Store Server Notification endpoint must not accept unauthenticated fake
  payloads in production.

## Open Questions

- Which IAP library is compatible with current Expo/EAS setup?
- Do we use StoreKit 2 APIs directly or a cross-platform library?
- Do we include lifetime product in Apple V1?
- Which Apple notification types are required for V1?

## Acceptance Criteria

- Apple sandbox purchase activates access through the same application service
  path as fake purchases.
- Apple restore refreshes backend access.
- Apple product mapping is server-owned.
- Existing fake purchase tests remain green.
- No Apple secret is exposed to mobile config.
