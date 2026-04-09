# PLAN 20A: Server Test Database Isolation

## Goal

Stop server integration tests from leaving traces in the main local development database.

This plan introduces an isolated PostgreSQL database for tests and a deterministic cleanup strategy.

## Why

The current auth integration tests run against the same PostgreSQL instance used for local development.

That creates two problems:

- tests can leave real data behind
- development data can affect test results

Even if tests clean some tables before each case, the database is still shared and therefore not truly isolated.

## Decision

Use a dedicated PostgreSQL test database, not an in-memory substitute.

Reason:

- production behavior is PostgreSQL-specific
- Prisma mappings and constraints should be tested against real PostgreSQL
- auth/session/reset flows should match real persistence semantics

## Scope

This plan covers only:

- test database isolation
- test environment variables
- Docker support for test DB
- test bootstrap and cleanup

This plan does **not** change:

- production auth logic
- social login
- mobile integration

## Target Design

### Separate Environments

Keep:

- `server/.env` for local development
- `server/.env.test` for integration tests

`DATABASE_URL` in `.env.test` must point to a dedicated test database.

Example:

- dev DB: `trailbook` on one port
- test DB: `trailbook_test` on another port

### Docker Strategy

Preferred approach:

- extend the existing Docker Compose file with a second PostgreSQL service for tests

Example conceptual services:

- `postgres`
- `postgres_test`

Each service should have:

- its own database name
- its own host port
- its own Docker volume

This avoids accidental data mixing.

## Test Bootstrap Changes

### Environment Selection

The server test command should explicitly load `.env.test`.

The test runtime must not depend on whichever `.env` file happens to be present.

### Schema Init

The test DB must be initialized independently from the dev DB.

Acceptable options:

- separate `db:test:init` script using the same SQL schema
- or Prisma-driven test schema setup if Prisma engine issues are resolved later

### Cleanup Strategy

Preferred cleanup:

- truncate all auth-related tables before each suite or before each test

Expected tables:

- `external_identities`
- `password_reset_tokens`
- `sessions`
- `subscriptions`
- `plans`
- `users`

Recommended statement:

- `TRUNCATE ... RESTART IDENTITY CASCADE`

This is better than row-by-row deletes because it is:

- faster
- clearer
- deterministic

## Scripts

Expected script additions:

- `db:test:up`
- `db:test:down`
- `db:test:init`
- `test`
- optionally `test:watch`

The `test` script should point to `.env.test`, not `.env`.

## Launch Config

VS Code launch entries should be added for:

- test DB up
- test DB init
- test DB down
- server auth tests against test DB

This keeps the workflow explicit and avoids accidental use of the dev DB.

## Acceptance Criteria

This plan is complete when:

- integration tests no longer use the dev database
- running tests does not leave traces in the dev database
- the test database can be recreated deterministically
- auth integration tests still pass

## Execution Order

1. Add `.env.test`
2. Add isolated Docker test DB service
3. Add test DB init scripts
4. Update test runner to load `.env.test`
5. Replace delete-based cleanup with `TRUNCATE ... CASCADE`
6. Verify that tests pass and dev DB remains untouched
