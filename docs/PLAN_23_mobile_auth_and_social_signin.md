# PLAN 23: Mobile Auth And Social Sign-In

## Goal

Add real authentication to the mobile app without removing demo mode.

This plan must cover:

- email/password login
- register
- logout
- forgot-password entry point
- Google sign-in
- Apple sign-in
- Facebook sign-in
- demo mode as a first-class alternative path

This plan does not yet implement trail sharing or sync. It prepares the mobile app for those features by establishing a real authenticated user model.

## Why This Comes Next

The server auth stack is now real:

- persistent users
- sessions
- local auth
- web auth
- server-owned social auth flows

The mobile app should not continue to behave as a demo-only shell if the next major feature is trail sharing.

Sharing requires:

- known authenticated owner
- known authenticated recipient
- stable identity across devices

## Product Direction

The mobile auth surface should expose:

- `Enter Demo`
- `Login`
- `Register`
- `Forgot password`
- `Continue with Google`
- `Continue with Apple`
- `Continue with Facebook`

Demo mode remains available because it still has clear product value:

- fast onboarding
- offline exploration
- no-account trial path

Real auth must sit alongside demo mode, not replace it outright.

## Demo Capability Constraint

Demo mode must remain local-only.

That means:

- demo users cannot sync trips with backend
- demo users cannot share trips

This is not necessarily fully implemented in this plan, but it must be treated as a product rule that shapes later UX and state handling.

## Core Session Model

The current mobile session model must evolve into an explicit auth mode model.

Minimum session states:

- `anonymous-demo`
- `authenticated-user`

The app should know whether the current user is:

- demo-only
- authenticated against backend

This distinction must be available in:

- auth UI
- settings
- future sharing gates
- future sync gates

## Backend Contract For Mobile V1

Initial mobile-backed endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`

For reset password:

- mobile can reuse the existing email-to-web reset flow
- no separate in-app reset completion flow is required in V1

## Mobile Auth Transport

### Local Auth

For email/password auth:

- mobile should call backend auth endpoints directly
- backend returns authenticated user
- mobile stores authenticated session state locally

### Social Auth

Mobile social sign-in should not blindly mirror the web browser redirect model.

Preferred mobile pattern:

1. native provider sign-in starts on device
2. mobile obtains provider credential / auth code / ID token
3. mobile sends provider result to backend
4. backend resolves user identity, linking, and session outcome

That means mobile should use provider-native login SDK/runtime flows where appropriate, while the server remains the authority for:

- identity verification
- account linking
- user creation
- session creation

If the current backend only supports browser redirect callback flow, this plan must explicitly identify the missing mobile callback/token exchange contract as follow-up server work.

## Required Server Alignment

This plan depends on one server-side clarification:

- mobile-friendly social auth completion endpoints

Examples of acceptable contracts:

- `POST /api/auth/social/google/mobile`
- `POST /api/auth/social/apple/mobile`
- `POST /api/auth/social/facebook/mobile`

Each such endpoint should accept verified provider artifacts from the mobile client and produce the same final auth result as web login:

- authenticated user
- session outcome
- stable identity linking

This is likely a dependency that must be implemented before mobile social sign-in can be fully completed.

## Mobile Storage Changes

The app will need a persistent auth store that can hold:

- auth mode
- authenticated user summary
- backend session/token material if used
- logout cleanup state

It must coexist cleanly with:

- demo mode data
- existing local trip storage

The auth store should not yet force migration of all trip data to backend sync.

## UI Scope

### Auth Entry Screen

The login/auth screen should present:

- email/password form
- social sign-in buttons
- `Enter Demo`
- navigation to `Register`
- navigation to `Forgot password`

### Settings

Settings should reflect current auth state:

- demo user
- authenticated user display name/email/providers
- logout action

### Feature Gating

V1 gating should be ready but minimal:

- sharing actions can later require authenticated session
- sync actions can later require authenticated session
- demo mode can remain valid for local-only usage

Future consequence for trip cards and trip detail UI:

- sync status badges must eventually reflect auth mode
- a demo trip should not present sync/share affordances as if they are available
- `pending sync` should not behave like a normal actionable state for demo users
- share actions should only become available for authenticated users and, later, for trips that meet sharing prerequisites

## Native Dependencies

Mobile social sign-in will likely require Expo/native packages.

Expected categories:

- Expo Auth Session or provider SDK integration
- Apple auth support
- Google auth support
- Facebook auth support

These dependencies must be chosen carefully to fit the existing Expo/native build strategy.

## Platform Notes

### Google

Should work on both iOS and Android.

### Apple

Required on iOS.

May be optional or unavailable on Android depending on product decision.

### Facebook

Requires provider app configuration and app ID setup.

## Suggested Delivery Phases

### Phase 1

- introduce mobile auth state model
- keep demo mode working
- implement email/password login/register/logout/me
- wire forgot-password entry to backend

### Phase 2

- add Google sign-in

### Phase 3

- add Apple sign-in

### Phase 4

- add Facebook sign-in

### Phase 5

- reflect authenticated identity in settings and future sharing gates

## Risks To Avoid

- replacing demo mode too early
- mixing browser-cookie assumptions into mobile auth design
- implementing mobile social auth entirely on client without backend identity authority
- blocking future sharing/sync behind an auth model that only works for web

## Done Criteria

This plan is complete when:

- mobile supports demo mode and real authenticated mode side-by-side
- email/password auth works against real backend endpoints
- social sign-ins exist on mobile for Google, Apple, and Facebook
- settings/auth UI clearly reflects demo vs authenticated state
- mobile auth model is ready for trail sharing work
