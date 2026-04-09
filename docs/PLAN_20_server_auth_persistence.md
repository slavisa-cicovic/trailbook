# PLAN 20: Server Auth Persistence

## Goal

Move the current auth bootstrap from in-memory scaffolding to real persistence backed by PostgreSQL.

This plan focuses only on:

- PostgreSQL setup
- Docker-based local development
- persistent auth data model
- local email/password auth persistence
- session persistence
- password reset persistence

This plan does **not** include:

- real social login provider integration
- mobile app integration
- trails or sharing domain

Those belong to the next plan.

## Why This Is Separate

Persistence should land before real social auth.

Reason:

- social login must resolve into real users and external identities
- that requires stable tables, constraints, and lookup rules
- otherwise OAuth work gets built on temporary assumptions

## Target Stack

- NestJS server
- PostgreSQL
- Docker / Docker Compose for local database runtime
- ORM or query layer to be chosen in execution phase

## Local Infrastructure

### Docker Services

Minimum local services:

- `postgres`

Optional later:

- `mailhog` or equivalent email sandbox
- `pgadmin` only if needed

### Local Development Requirements

Need:

- `docker-compose.yml` or equivalent compose file
- local environment variables for database connection
- repeatable dev bootstrap command

Example environment values:

- `DATABASE_URL`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`

## Persistence Scope

### Required Tables

#### `users`

Minimum columns:

- `id`
- `email`
- `display_name`
- `role`
- `password_hash` nullable
- `created_at`
- `updated_at`
- `last_login_at`

Constraints:

- unique email

#### `external_identities`

Minimum columns:

- `id`
- `user_id`
- `provider`
- `provider_subject`
- `email`
- `created_at`
- `updated_at`

Constraints:

- unique `(provider, provider_subject)`
- foreign key to `users`

#### `sessions`

Minimum columns:

- `id`
- `user_id`
- `created_at`
- `expires_at`
- `revoked_at`
- `user_agent`
- `ip_address`

Constraints:

- foreign key to `users`

#### `password_reset_tokens`

Minimum columns:

- `id`
- `user_id`
- `token_hash`
- `expires_at`
- `used_at`
- `created_at`

Constraints:

- foreign key to `users`

#### `plans`

This is not actively used by auth yet, but should be present or at least reserved early because user access will later depend on it.

Minimum columns:

- `id`
- `code`
- `name`
- `billing_type`
- `created_at`
- `updated_at`

Expected codes:

- `demo`
- `monthly`
- `yearly`
- `lifetime`

#### `subscriptions`

Also not fully enforced in this phase, but should be part of the schema direction.

Minimum columns:

- `id`
- `user_id`
- `plan_id`
- `status`
- `started_at`
- `current_period_ends_at`
- `canceled_at`
- `created_at`
- `updated_at`

## Auth Flow Changes

### Register

Must change from in-memory creation to:

- validate email uniqueness in database
- hash password
- insert user row
- optionally create default `demo` subscription/access record

### Login

Must change to:

- lookup user by email
- verify hashed password
- create persisted session
- return/set session cookie

### Logout

Must change to:

- revoke persisted session

### Me

Must change to:

- resolve session from cookie
- load user from database
- return user summary

### Forgot Password

Must change to:

- create hashed reset token
- store expiry
- keep email delivery behind abstraction

### Reset Password

Must change to:

- validate token
- ensure not expired / not used
- update password hash
- mark reset token as used

## Token Strategy

This plan should explicitly separate:

- browser authentication
- future mobile authentication

### Browser V1

For the web app in this phase, the preferred mechanism remains:

- HTTP-only session cookie

This keeps the browser flow simple and aligned with the current scope.

### Future Mobile-Compatible Token Model

Even though mobile is out of scope for this phase, the persistence design must leave room for:

- `access token`
- `refresh token`

The intended direction is:

- short-lived access token
- persisted, revocable refresh token

### Refresh Token Requirements

When token auth is introduced later, refresh token handling should support:

- persistence in database
- expiry
- revocation
- rotation
- user/session level invalidation

Because of that, the current session model should not be designed in a way that blocks later token-based flows.

### Persistence Direction

This means the auth persistence layer should be compatible with later additions such as:

- `refresh_tokens` table
- token family / rotation tracking
- device-aware token revocation

Those pieces do not need to be implemented in this phase, but they should be acknowledged in the design.

## Security Requirements

### Passwords

- never store plain passwords
- hash with a modern password hasher
- bcrypt or argon2 are acceptable directions

### Sessions

- HTTP-only cookie
- secure in production
- session rotation should be considered later

### Reset Tokens

- store hashed token, not raw token
- short expiry
- single use

## API Shape

The endpoint list stays the same:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`

The difference is that all of them become database-backed.

## Execution Phases

### Phase 1

- add Docker PostgreSQL setup
- add server env handling
- choose and wire ORM/query layer
- create initial schema/migrations

### Phase 2

- persist `users`, `sessions`, `password_reset_tokens`
- replace in-memory auth service paths

### Phase 3

- add `plans` and `subscriptions` schema foundation
- create default demo access path for new users

### Phase 4

- add integration tests for register/login/logout/me/reset

## Risks To Avoid

- implementing OAuth before persistence is stable
- keeping demo/business access rules inside role logic
- storing raw password reset tokens
- relying on in-memory sessions past bootstrap
- designing session persistence in a way that blocks future refresh-token support

## Done Criteria

This plan is complete when:

- auth data lives in PostgreSQL
- local database runs through Docker
- local register/login/logout/me works against real persistence
- forgot/reset token flow is persisted
- typecheck and server start succeed in local development
