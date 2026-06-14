# PLAN 65E: Google Purchase Sandbox

## Goal

Add Google Play Billing support using sandbox/test purchases while preserving
the provider-neutral backend from `PLAN_65A`.

Google should produce normalized purchase events that flow through the same
`PurchaseApplicationService.applyNormalizedEvent` path as fake and Apple
providers.

## Dependencies

- `PLAN_65A_purchase_backend_fake_provider.md`
- `PLAN_65B_mobile_purchase_simulation_ui.md`
- optionally `PLAN_65C_entitlement_enforcement.md`

## Scope

Google Play only.

Included:

- Play Console product setup checklist
- Google product mapping in `store_products`
- Android mobile purchase provider
- server-side purchase token verification
- sandbox/test purchase and restore testing
- Real-time Developer Notifications preparation

Not included:

- Apple App Store integration
- production rollout to all users
- broad paywall redesign
- web billing

## Google Setup Requirements

Before implementation:

- Play Console app record exists.
- Android package id matches build.
- Play Billing products/subscriptions are created.
- License tester accounts are configured.
- Backend has access to Google Play Developer API.
- Public backend URL exists if testing RTDN.
- Google service account credentials are available server-side only.

## Backend Work

### Product Mapping

Add Google rows to `store_products`:

```text
provider=google
provider_product_id=<Play product id>
internal_product_code=...
plan_id=...
billing_type=...
active=true
```

### Google Provider

Implement `GooglePurchaseProvider`.

Responsibilities:

- verify Google purchase token server-side
- map Play product id through `store_products`
- return `NormalizedPurchaseEvent`
- never update subscription/entitlement state directly

### Verification Endpoint

Use the provider-neutral endpoint reserved in `PLAN_65D`:

```http
POST /api/purchases/verify
```

Input:

```ts
{
  provider: "google";
  productId: string;
  purchaseToken: string;
}
```

The endpoint should call the Google provider, then
`PurchaseApplicationService.applyNormalizedEvent`.

### Real-time Developer Notifications

Prepare:

```http
POST /api/purchases/google/notifications
```

RTDN uses Google Pub/Sub semantics. Treat notification handling as a separate
security-sensitive piece:

- verify source
- fetch current purchase state from Google
- normalize into purchase events
- apply idempotently

## Mobile Work

Add `GoogleMobilePurchaseProvider`.

Responsibilities:

- load Play products through a native Billing-compatible library
- start purchase on Android device
- send purchase token to backend verify endpoint
- acknowledge/consume purchases as required by Google flow
- refresh access via `/api/purchases/me`
- restore purchases

The UI should remain provider-neutral.

## Testing Strategy

### Local

- Keep fake provider tests as deterministic baseline.
- Unit-test Google provider normalization with recorded sandbox/test payload
  fixtures.

### Sandbox Manual

1. Build Android app with Google provider enabled.
2. Install from Play internal testing or compatible test distribution.
3. Login as test user.
4. Load products.
5. Buy test monthly subscription.
6. Verify backend creates purchase transaction.
7. Verify `/api/purchases/me` returns active entitlement.
8. Restore purchases.
9. Test renewal/cancel/expire behavior available in Play test environment.

## Release Safety

- Google provider only enabled for Android builds.
- Fake provider remains disabled in production.
- Server verifies purchase token; mobile purchase state is not trusted.
- Google service account credentials stay server-side.
- RTDN endpoint must not accept unauthenticated fake payloads in production.

## Open Questions

- Which IAP library is compatible with current Expo/EAS setup?
- Do we need a custom dev client for Google Billing tests?
- How do we handle purchase acknowledgment in the chosen library?
- Do we include lifetime product in Google V1?
- Which RTDN notification types are required for V1?

## Acceptance Criteria

- Google sandbox/test purchase activates access through the same application
  service path as fake purchases.
- Google restore refreshes backend access.
- Google product mapping is server-owned.
- Existing fake purchase tests remain green.
- No Google service account secret is exposed to mobile config.
