# PLAN 30: Mobile/Server Token Hardening

## Goal

Harden mobile authentication so stolen local device data has a smaller blast radius, while keeping the current product usable and without blocking future OAuth-first production rollout.

This plan builds on the current model:
- server stores opaque hashed session tokens in `sessions`
- mobile stores one bearer `sessionToken`
- mobile now keeps that token in secure storage instead of plain async storage

The next step is not "perfect secrecy on rooted phones". That is not realistic. The real target is:
- shorter-lived bearer tokens
- renewable sessions
- explicit revocation
- per-device visibility and control

## Current State

### Server

- login creates one long-lived opaque session token
- token is stored hashed in `sessions.token_hash`
- session TTL is controlled by `SESSION_TTL_DAYS`
- logout revokes current session
- password reset revokes all active sessions for that user
- mobile uses `Authorization: Bearer <sessionToken>`

### Mobile

- `sessionToken` is stored in secure storage
- user/session metadata stays in local async storage
- there is no refresh token
- there is no token rotation
- there is no silent token renewal
- there is no device session list UI

## Security Problem

The main remaining weakness is not that the token is stored locally at all. Some local persistence is unavoidable. The weakness is that the current token is:
- bearer-style
- relatively long-lived
- single-layer

If the token is extracted from a rooted/jailbroken or otherwise compromised device, the attacker can use it until:
- it expires
- the user logs out
- the server revokes it

That is too much exposure for a production-grade mobile auth model.

## Target Model

Move to a two-token model:

- short-lived `access token`
- longer-lived `refresh token`

### Access Token

- used on ordinary API requests
- short TTL, for example `10-15 minutes`
- stored in memory when possible, and optionally also in secure storage for app resume practicality
- if stolen, useful for only a short period

### Refresh Token

- used only to obtain a new access token
- long TTL, for example `30 days`
- stored only in secure storage
- rotated on every refresh
- server stores only its hash
- individually revocable

This keeps the current "opaque token" style and does not require JWTs.

## Recommended Architecture

### Keep Opaque Tokens

Do not switch to JWT just because token hardening is planned.

For this app, opaque tokens are a better fit:
- simple server-side revocation
- simple per-device session tracking
- no signature/key-management overhead
- easier rotation semantics

The correct hardening is:
- opaque access token
- opaque refresh token
- both hashed at rest on the server

### Split Session Concepts

Current `sessions` row should evolve into a device-auth session record, while refresh tokens become first-class rotating credentials.

Recommended shape:

- `sessions`
  - user
  - device id
  - created at
  - expires at
  - revoked at
  - user agent
  - ip address
  - last used at

- `refresh_tokens`
  - session id
  - token hash
  - expires at
  - revoked at
  - rotated from token id
  - replaced by token id
  - created at
  - last used at

Access tokens can either:
- be stored server-side too
- or be self-contained opaque entries with short TTL in a separate store/table

For this codebase, simplest pragmatic option is:
- create an `access_tokens` table too
- keep everything symmetric and revocable

## Mobile Storage Direction

### SecureStore

Keep using secure storage for secrets:
- refresh token
- optionally access token if app resume UX needs it

### AsyncStorage

Keep only non-secret metadata there:
- display name
- user id
- providers
- mode
- role if needed for UI

### In-Memory Preferred

Preferred runtime model:
- access token lives in memory
- refresh token lives in secure storage
- on app cold start:
  - load refresh token
  - call refresh endpoint
  - obtain fresh access token

If startup UX becomes too chatty, allow secure-storage fallback for access token too, but keep its TTL short.

## API Changes

### New Endpoints

- `POST /api/auth/mobile/refresh`
  - input: refresh token
  - output: new access token, rotated refresh token, user summary

- `POST /api/auth/mobile/logout`
  - revoke current device session and its refresh chain

- `POST /api/auth/mobile/logout-all`
  - revoke all user sessions

- `GET /api/auth/mobile/sessions`
  - list active device sessions

- `DELETE /api/auth/mobile/sessions/:sessionId`
  - revoke one remote device session

### Existing Endpoints

- `mobile/login`
  - should return:
    - access token
    - refresh token
    - session id
    - user

- `mobile/me`
  - should authenticate via access token, not long-lived session token

## Rotation Rules

Refresh token rotation must be strict:

1. client sends refresh token
2. server verifies token hash and session status
3. server creates:
- new access token
- new refresh token
4. old refresh token is marked revoked/replaced

If an already-rotated refresh token is replayed, treat that as suspicious:
- revoke the entire session chain
- force login again

That is the main practical defense against stolen refresh token replay.

## Revocation Rules

The server must support:

- revoke one current session
- revoke all sessions for user
- revoke one selected remote device session
- revoke session automatically on:
  - password reset
  - user deactivation if added later
  - suspicious refresh replay

## Device Awareness

Per-device session management should use the already existing `deviceId` concept from mobile.

That gives useful UX:
- "This iPhone"
- "Pixel 8"
- "Old Android device"

Exact friendly naming can come later, but the domain model should already support:
- one user
- many device sessions

## Root/Jailbreak Position

This plan does not attempt an impossible guarantee that tokens cannot be extracted on a compromised device.

Instead it reduces damage by:
- storing secrets in secure OS-backed storage
- shortening access-token lifetime
- rotating refresh tokens
- enabling quick revocation

Optional future hardening:
- root/jailbreak detection
- warning banner or soft block
- stricter policy for sharing/sync on compromised devices

This is optional and should not block store release.

## Migration Strategy

Do not try to switch everything in one breaking step.

### Phase 1

- add refresh token persistence on server
- add access token persistence on server
- keep current session table as top-level session/device record
- change mobile login response to dual-token result
- mobile starts using access token for requests

### Phase 2

- add refresh endpoint
- add silent renewal on app launch and 401 recovery
- add token rotation

### Phase 3

- add device session listing/revocation in settings
- add logout-all

### Phase 4

- optionally align web token/session strategy if needed
- or keep web on cookie session, mobile on token pair

## Testing Requirements

### Server

- login returns access + refresh token pair
- refresh rotates refresh token
- old refresh token replay revokes session
- revoked session cannot refresh
- logout revokes current session
- logout-all revokes all sessions
- password reset revokes all device sessions

### Mobile

- login persists only allowed data in async storage
- tokens live in secure storage
- app cold start restores authenticated state through refresh
- expired access token is renewed cleanly
- revoked refresh token forces login screen

## Out of Scope

- full biometric local re-auth gate
- root/jailbreak detection enforcement
- web auth rewrite
- OAuth provider rollout details

## Outcome

After this plan:
- stolen local app data is less useful
- session compromise window is shorter
- server has real per-device session control
- mobile auth is stronger without changing the product surface too much
- the app is in a much better state for App Store / Google Play production use
