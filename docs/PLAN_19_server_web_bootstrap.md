# PLAN 19: Server And Web Auth Bootstrap

## Goal

Define the first backend and web step with a deliberately narrow scope:

- `server/` as a NestJS application
- `web/` as a Next.js + MUI application
- authentication only in this phase

This step does **not** include:

- mobile app integration
- trail sync
- trail sharing
- media download
- trail browsing in the web app

The purpose of this plan is to establish the authentication foundation cleanly before adding trail and sharing features.

## Scope Boundary

### In Scope

- server bootstrap
- web bootstrap
- auth domain and API
- login
- logout
- register
- forgot-password
- current session / current user endpoint
- social sign-in preparation and initial support boundaries

### Out Of Scope

- any changes in `mobile/`
- trail CRUD
- trail sharing
- waypoint/media APIs
- browser trail list/detail screens beyond auth shell

## Product Assumptions

The user should be able to authenticate using:

- email + password
- Google account
- Facebook account
- Apple account

This requirement should be reflected in the server auth design from the start, even if all providers are not fully implemented in the same coding pass.

The system should also be designed with a clear distinction between:

- user roles
- commercial plan / subscription state
- entitlement-based feature access

For now, the only required roles are:

- `user`
- `admin`

There is no immediate `admin` use case in this phase, but the role should exist in the model so later web administration features can be added without refactoring the auth core.

## Repository Structure

Planned structure:

```text
mobile/
server/
web/
docs/
```

### `mobile/`

No changes in this step.

### `server/`

NestJS application responsible only for authentication in this phase.

Initial modules:

- `auth`
- `users`
- `health`

Optional later modules:

- `trails`
- `trail-shares`
- `media`
- `sync`

### `web/`

Next.js + MUI application with only auth-related pages and a minimal authenticated shell.

Initial areas:

- `login`
- `register`
- `forgot-password`
- authenticated placeholder/dashboard shell

## Auth Domain Model

### User

Minimum fields:

- `id`
- `email`
- `displayName`
- `role`
- `passwordHash` nullable for social-only users
- `authProviderSummary`
- `createdAt`
- `updatedAt`
- `lastLoginAt`

Allowed role values in this phase:

- `user`
- `admin`

### External Identity

To support Google / Facebook / Apple cleanly, keep external identities separate from the core user row.

Minimum fields:

- `id`
- `userId`
- `provider`
- `providerSubject`
- `email`
- `createdAt`
- `updatedAt`

Supported provider values:

- `local`
- `google`
- `facebook`
- `apple`

### Password Reset Token

Minimum fields:

- `id`
- `userId`
- `tokenHash`
- `expiresAt`
- `usedAt`
- `createdAt`

### Session

If using session-backed auth, minimum fields:

- `id`
- `userId`
- `createdAt`
- `expiresAt`
- `revokedAt`
- `userAgent`
- `ipAddress`

## Access And Monetization Model

Even though monetization is out of scope for the first implementation pass, the plan should reserve a minimal data model for it now.

The important design decision is:

- roles are for authorization identity
- plans and subscriptions are for product access
- entitlements are for concrete feature rights

This avoids misusing roles such as `demo`, `monthly`, `yearly`, or `lifetime`.

### Plan

Minimum fields:

- `id`
- `code`
- `name`
- `billingType`
- `createdAt`
- `updatedAt`

Expected initial plan codes:

- `demo`
- `monthly`
- `yearly`
- `lifetime`

Expected `billingType` values:

- `free`
- `recurring`
- `one_time`

### Subscription

Minimum fields:

- `id`
- `userId`
- `planId`
- `status`
- `startedAt`
- `currentPeriodEndsAt`
- `canceledAt`
- `createdAt`
- `updatedAt`

Expected initial status values:

- `active`
- `expired`
- `canceled`
- `lifetime`

### Entitlement Snapshot

This can be materialized later, but the auth and user-facing API should assume that user access is determined by entitlement checks rather than role checks.

Minimum entitlement examples:

- `canShareTrails`
- `canSyncWithBackend`
- `canCreateUnlimitedTrails`
- `maxTrailCount`

### Initial Product Interpretation

The current product idea can be represented as:

- `demo`
  - trail creation limited, for example `maxTrailCount = 5`
  - no sharing
  - no backend sync
- `monthly`
  - full access while subscription is active
- `yearly`
  - full access while subscription is active
- `lifetime`
  - full access permanently

This is not part of the implementation scope of this phase, but the data model should leave room for it from the start.

## Billing Direction

The intended billing direction for mobile products should be stated explicitly now.

### Mobile Billing

For mobile app monetization:

- iOS should use Apple in-app purchase / App Store billing
- Android should use Google Play Billing

The app should **not** be designed around a custom Stripe or PayPal checkout inside the mobile application for digital access rights.

This should be treated as the default product direction, not as an optional implementation detail.

### Web Billing

Web billing may remain a theoretical option in the domain model, but it should be treated only as a possible future extension.

Current product expectation:

- web billing is not part of the near-term plan
- web billing will likely never be implemented

Because of that, the backend data model should be flexible enough to represent billing source, but the practical product direction should assume store-native mobile billing only.

## Auth Strategy

### Browser

Preferred approach for `web/`:

- HTTP-only secure session cookie

Reason:

- cleaner browser auth flow
- lower accidental token exposure in frontend code
- fits Next.js app usage well

### Server

Server should expose auth in a way that can later support mobile bearer tokens too, but this phase should stay focused on browser auth and auth APIs only.

The server should also expose user/session responses in a way that can later include:

- `role`
- `plan`
- `subscriptionStatus`
- `entitlements`

### Social Authentication

The auth architecture must assume support for:

- Google OAuth
- Facebook OAuth
- Sign in with Apple

The cleanest direction is:

- local auth and social auth resolve into the same `User`
- provider-specific identity stays in `ExternalIdentity`

That avoids polluting the core user record with provider-specific fields.

## Server Responsibilities In This Phase

The NestJS server should handle:

- local registration
- local login
- logout
- forgot-password request
- password reset confirmation flow
- current authenticated user lookup
- social login initiation/callback boundaries

The server should also establish the foundation for later access-control responses, even if monetization logic is not enforced yet.

The server should not yet handle:

- trail data
- sharing permissions
- media access

## API Scope: V1 Auth Only

### Health

- `GET /health`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/me`

### Social Auth

The API shape should reserve endpoints for:

- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/facebook`
- `GET /auth/facebook/callback`
- `GET /auth/apple`
- `GET /auth/apple/callback`

Even if provider integration is staged, these routes should be part of the design now.

## Web Scope: V1 Auth Only

### Pages

- login page
- register page
- forgot-password page
- reset-password page
- authenticated landing shell

### UI Direction

The web app should be intentionally narrow in this phase:

- no trail browsing yet
- no media browser yet
- only auth and proof that authenticated session flow works

That keeps the first step small and testable.

## Implementation Notes

### Local Auth

Required:

- validated email
- password hashing
- duplicate email protection
- session creation on successful login

### Forgot Password

Required:

- request endpoint
- reset token generation
- expiry
- reset confirmation endpoint

Email delivery can initially be abstracted behind an interface if concrete delivery is not implemented in the same pass.

### Social Providers

Required at minimum in the design:

- provider abstraction
- callback handling boundary
- mapping external identity to local user

If staged delivery is needed, the likely order should be:

1. Google
2. Apple
3. Facebook

Reason:

- Google and Apple are typically higher-value for this product
- Facebook can remain supported in the architecture without necessarily being first to ship

## Delivery Order

### Phase 1

- bootstrap `server/` NestJS
- bootstrap `web/` Next.js + MUI
- health endpoint
- minimal web shell

### Phase 2

- local auth: register/login/logout/me

### Phase 3

- forgot-password and reset-password flow

### Phase 4

- social auth integration:
  - Google
  - Apple
  - Facebook

## Risks To Avoid

- mixing auth and trail scope too early
- designing the user table as provider-specific
- encoding subscription state into roles
- building web trail pages before auth is stable
- coupling current mobile local session model to the new backend too early

## Decision Summary

This step is intentionally limited to:

- `server/` bootstrap
- `web/` bootstrap
- authentication only

Authentication must be designed to support:

- local credentials
- Google
- Facebook
- Apple

The domain model should also reserve space for:

- `user` and `admin` roles
- commercial plans
- subscriptions
- entitlement-based feature access

The mobile app remains untouched in this phase.

## Next Step

The next execution plan after this should be focused and concrete, for example:

- `PLAN_20_server_nest_auth_bootstrap.md`
- `PLAN_21_web_next_mui_auth_bootstrap.md`

or one combined execution plan if both should be scaffolded together.
