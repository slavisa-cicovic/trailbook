# PLAN 65B: Mobile Purchase Simulation UI

## Goal

Add a mobile purchase provider boundary and a gated local simulation UI.

This plan depends on `PLAN_65A_purchase_backend_fake_provider.md`.

## Scope

Mobile only, except for minor API schema additions if needed.

Included:

- mobile purchase domain types
- `MobilePurchaseProvider` interface
- fake mobile purchase provider
- purchase access refresh service
- gated settings/debug simulation screen
- basic UI state for current access and entitlements

Not included:

- native Apple StoreKit integration
- native Google Play Billing integration
- production paywall rollout
- entitlement enforcement across existing sync/media/sharing flows

## Mobile Boundary

Create a purchase provider interface:

```ts
interface MobilePurchaseProvider {
  listProducts(): Promise<PurchaseProduct[]>;
  purchase(input: {
    productId: string;
    scenario?: FakePurchaseScenario;
  }): Promise<PurchaseResult>;
  restorePurchases(): Promise<PurchaseAccess>;
  refreshAccess(): Promise<PurchaseAccess>;
}
```

Rules:

- UI depends on `MobilePurchaseProvider`.
- Fake endpoint calls must be contained in `FakeMobilePurchaseProvider`.
- Provider selection is centralized.
- `refreshAccess` calls backend `/api/purchases/me`.

## API Schemas

Add zod schemas for:

- `PurchaseProduct`
- `PurchaseAccess`
- fake purchase result

Keep these in `mobile/src/services/api/schemas`.

## Provider Selection

Create a small resolver:

```ts
getMobilePurchaseProvider(identitySession): MobilePurchaseProvider
```

Initial behavior:

- if fake is enabled and user is dev/test-user -> `FakeMobilePurchaseProvider`
- otherwise no-op/read-only provider that can only refresh access

Do not treat mobile env as security. Server remains authoritative.

## State

Add minimal local state if useful:

```ts
purchaseAccess: PurchaseAccess | null
purchaseProducts: PurchaseProduct[]
lastRefreshedAt: string | null
```

This can be a store or screen-local state for the first slice.

Avoid over-coupling access state into auth/session until entitlement enforcement
is implemented in `PLAN_65C`.

## Simulation Screen

Add:

```text
Settings -> Purchases simulation
```

Visible only when:

- `__DEV__`, or
- backend/session role indicates `test_user` or admin capability

Screen should show:

- current subscription status
- current plan code
- current period end
- entitlement list
- available fake products
- scenario actions:
  - buy monthly
  - buy yearly
  - buy lifetime if product exists
  - renew
  - cancel subscription
  - expire
  - refund
  - revoke
  - pending
  - restore

Use existing reusable UI components where practical:

- `ScreenLayout`
- `Card`
- `LoadingButton`
- `ModalActions` only if a modal is needed

## UX Rules

- Every action must show loading state.
- After every action, refresh `/api/purchases/me`.
- Failed purchases should show a clear message.
- The screen must not imply real Apple/Google purchase availability.
- The screen should label itself as simulation/development tooling.

## Tests

Mobile tests:

- fake provider calls backend fake simulate endpoint
- refresh access calls `/api/purchases/me`
- provider resolver does not expose fake provider to normal production user
- simulation screen is hidden for normal user
- product list renders
- action refreshes access state after success
- declined/pending/failure scenario displays message

## Manual Verification

1. Login as test user.
2. Confirm Settings shows `Purchases simulation`.
3. Open screen and confirm products load.
4. Buy monthly fake product.
5. Confirm access changes to active.
6. Run expire/refund/revoke.
7. Confirm paid entitlements disappear.
8. Login as normal user.
9. Confirm simulation screen is hidden.

## Acceptance Criteria

- Mobile purchase UI uses provider boundary.
- Fake simulation UI works against backend from `PLAN_65A`.
- Fake simulation UI is gated.
- No native Apple/Google billing library is required.
- Existing auth, sync, recording and media flows are unchanged.
