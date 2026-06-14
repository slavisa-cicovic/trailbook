# PLAN 65C: Entitlement Enforcement

## Goal

Start using purchase-derived entitlements to gate selected product capabilities.

This plan depends on:

- `PLAN_65A_purchase_backend_fake_provider.md`
- `PLAN_65B_mobile_purchase_simulation_ui.md`

## Scope

Backend and mobile enforcement for a small, explicit set of capabilities.

This plan should be narrow. Do not convert the entire app to paid access in one
pass.

## Non-Goals

- Do not add Apple/Google real purchase providers.
- Do not redesign demo mode.
- Do not enforce every possible future entitlement.
- Do not break local-only recording for users without paid access.

## Enforcement Principles

- Backend is authoritative.
- Mobile gating is UX only.
- Server APIs that create cloud/server-side cost must check entitlements.
- Local-only features should remain available unless explicitly paid.
- Demo rules should remain clear and separate from paid subscription state.

## Candidate Entitlements

Initial entitlement set:

```text
sync
sharing
photo_storage
web_access
raw_reprocessing
advanced_diagnostics
```

Recommended first enforcement slice:

1. `sync`
2. `photo_storage`
3. `sharing`

Leave `web_access`, `raw_reprocessing`, and `advanced_diagnostics` for later
unless there is an immediate product decision.

## Backend Access Service

Create a provider-neutral entitlement service:

```ts
class EntitlementService {
  getCurrentAccess(userId: string): Promise<PurchaseAccess>;
  hasEntitlement(userId: string, code: EntitlementCode): Promise<boolean>;
  requireEntitlement(userId: string, code: EntitlementCode): Promise<void>;
}
```

Rules:

- used by controllers/services before server-side cost operations
- never reads mobile-provided entitlement state
- can include demo/test/admin bypasses only if explicit and documented

## Backend Enforcement Points

Potential first checks:

### Sync

Endpoints:

- `POST /api/trips/sync`
- `POST /api/trips/:tripId/points/sync`
- `POST /api/trips/:tripId/stats/sync`
- trip group sync if it stores server data

Required entitlement:

```text
sync
```

### Photo Storage

Endpoint:

- `POST /api/trips/:tripId/attachments/upload`

Required entitlement:

```text
photo_storage
```

### Sharing

Endpoints:

- create/revoke trip shares

Required entitlement:

```text
sharing
```

Important: recipients should not need paid sharing entitlement to view a trip
shared with them unless that becomes a product decision later.

## Mobile UX

Mobile should show clear disabled states before calling server:

- sync button disabled or explains paid requirement
- photo upload/sync warning if no `photo_storage`
- sharing UI disabled or explains paid requirement

Use `/api/purchases/me` as the source of access.

Do not hide local recording or local trip browsing.

## Demo Rules

Keep current demo behavior explicit:

- demo data stays local
- no server sync
- photo count limits remain local unless backend demo support changes

If demo users later become authenticated limited users, write a separate plan.

## Tests

Backend:

- sync endpoint rejects user without `sync`
- sync endpoint accepts user with `sync`
- upload endpoint rejects user without `photo_storage`
- share endpoint rejects user without `sharing`
- shared recipient can still read shared content
- admin/test bypass behavior if enabled is explicit

Mobile:

- sync UI reflects missing entitlement
- simulation purchase refresh enables gated action
- expired/refunded access disables gated action again
- server rejection displays useful error

## Manual Verification

1. Login as test user without paid fake purchase.
2. Confirm sync/sharing/photo storage are blocked or explained.
3. Buy fake monthly product.
4. Confirm access enables selected actions.
5. Sync a trip with a photo.
6. Share a trip.
7. Expire/refund fake purchase.
8. Confirm selected actions are blocked again.

## Acceptance Criteria

- Selected server endpoints enforce entitlements.
- Mobile reflects entitlement state without becoming the source of truth.
- Local recording remains usable without paid access.
- Fake purchase simulation can exercise entitlement changes end-to-end.
- Enforcement scope is documented and intentionally limited.
