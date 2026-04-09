# PLAN 22: Server Social Auth

## Goal

Implement real social authentication on the server after persistence is in place.

This plan focuses on:

- Google login
- Apple login
- Facebook login
- external identity linking rules
- provider callback handling

This plan assumes `PLAN_20` has already been executed.

## Why This Is Separate

OAuth integration has a different failure profile than auth persistence.

Persistence work is about:

- schema
- sessions
- password auth
- tokens

Social auth work is about:

- provider configuration
- callback correctness
- identity linking
- account collision handling

Those should not be mixed into one large execution pass.

## Supported Providers

Required providers:

- Google
- Apple
- Facebook

Recommended delivery order:

1. Google
2. Apple
3. Facebook

Reason:

- Google and Apple are likely the most valuable for this app
- Facebook support can still be designed up front without forcing it to be first

## Core Data Dependency

This plan depends on:

- `users`
- `external_identities`
- `sessions`

Social auth should never create a provider-specific user model.

Rule:

- one local `User`
- many `ExternalIdentity` rows

## Provider Model

### External Identity Record

Each provider login should resolve into:

- provider name
- provider subject / unique identifier
- normalized email if available
- optional profile metadata needed at login time

### User Linking Rules

Minimum rules:

1. If `(provider, provider_subject)` already exists:
   - load linked user
   - log in

2. If provider identity does not exist but verified email matches an existing user:
   - decide whether to auto-link or require explicit confirmation

3. If no existing user matches:
   - create new user
   - create external identity

The exact rule for email collision must be chosen explicitly in execution.

Preferred conservative rule:

- auto-link only when provider email is verified and unique

## Server Responsibilities

### OAuth Start

For each provider:

- create auth start endpoint
- redirect to provider consent screen

### OAuth Callback

For each provider:

- verify callback payload
- exchange code/token if needed
- fetch provider identity profile
- resolve or create user
- create session
- redirect to web authenticated area

## Endpoint Scope

### Google

- `GET /api/auth/google`
- `GET /api/auth/google/callback`

### Apple

- `GET /api/auth/apple`
- `GET /api/auth/apple/callback`

### Facebook

- `GET /api/auth/facebook`
- `GET /api/auth/facebook/callback`

## Web Scope

The web app should:

- expose provider buttons on login/register pages
- redirect to backend provider start endpoints
- handle return into authenticated shell

The web app should not implement provider logic directly in this phase beyond redirect entry points.

## Provider Configuration

### Google

Need:

- client ID
- client secret
- allowed redirect URI

### Apple

Need:

- services ID / client ID
- team ID
- key ID
- private key
- allowed redirect URI

### Facebook

Need:

- app ID
- app secret
- allowed redirect URI

## Environment Variables

The server will likely need values such as:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `AUTH_BASE_URL`
- `WEB_BASE_URL`

## Session Outcome

Successful social auth should produce the same final state as local login:

- valid user
- valid session
- cookie set for browser
- `GET /api/auth/me` returns authenticated user

## Account Creation Rules

Social auth may create users with:

- no `password_hash`
- at least one `external_identity`

That should be a supported, normal state.

## Error Handling Requirements

Need explicit handling for:

- provider denial / canceled consent
- missing email from provider
- unverified email
- email collision with existing local account
- callback replay or invalid state

## Security Requirements

- use OAuth state parameter correctly
- validate callback origin expectations
- do not trust raw provider payload without verification
- do not couple session creation to unverified identity data

## Execution Phases

### Phase 1

- define provider abstraction and callback contract
- wire Google end-to-end first

### Phase 2

- wire Apple end-to-end

### Phase 3

- wire Facebook end-to-end

### Phase 4

- add provider-specific tests and account-linking tests

## Risks To Avoid

- implementing provider logic before database-backed users exist
- duplicating users per provider
- auto-linking on unsafe email assumptions
- mixing frontend-only OAuth handling with server-owned session model

## Done Criteria

This plan is complete when:

- Google, Apple, and Facebook login are supported server-side
- each provider resolves into `User` + `ExternalIdentity`
- web login/register pages can start social auth
- successful provider callback ends in a valid authenticated browser session
