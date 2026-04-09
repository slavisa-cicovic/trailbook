# PLAN 21: Web Real Auth And Server Mail

## Goal

Move the web auth shell from placeholder behavior to real server-backed auth flows.

This plan also introduces a real server-side mail abstraction so `forgot-password` becomes a complete flow instead of a token preview response.

## Scope

This plan covers:

- web `login`
- web `register`
- web `forgot-password`
- web `reset-password`
- server mail abstraction
- server reset email delivery

This plan does **not** include:

- mobile auth integration
- social login provider implementation
- billing
- trails domain

## Why These Belong Together

`forgot-password` is not truly implemented unless:

- the web app submits the request to the server
- the server creates a reset token
- the server sends an email with a reset link
- the web app handles the reset page

So the web real-auth work and mail delivery work should land together.

## Architectural Direction

### Server Owns Auth Logic

The backend should remain channel-agnostic.

That means:

- web calls real auth endpoints
- mobile can later call the same endpoints
- the server does not embed web-only business logic into auth decisions

### Password Reset UX

The reset flow can still terminate on the web app even when the original request comes from mobile.

That is acceptable and useful because:

- the reset link naturally opens in email/browser
- mobile does not need its own reset UI immediately
- the auth domain remains centralized on the server

## Server Changes

### Transactional Outbox Requirement

Password reset mail delivery should follow a transactional outbox pattern.

Do **not** rely on directly sending email inside the same request flow as the only source of truth.

Reason:

- database writes and external email delivery cannot safely share one real ACID transaction
- otherwise we risk either:
  - reset token persisted but email not sent
  - email sent but no durable server-side record of the send request

Required direction:

- in one database transaction:
  - create the password reset token
  - create a mail outbox record
- after commit:
  - dispatch the mail from the outbox
  - mark the outbox record as `sent` or `failed`

This gives us durable and retryable mail delivery semantics.

### Mail Abstraction

Introduce a server mail layer, for example:

- `MailModule`
- `MailService`
- optional provider-specific adapter

The auth module should depend on the abstraction, not on a specific email provider.

### First Mail Transport

Use a development-safe mail transport first.

Preferred options:

- `MailHog`
- or `Ethereal`

Avoid wiring production email infrastructure in this step.

### Forgot Password

Change `forgot-password` so that it:

- creates the token as it does now
- creates a mail outbox record in the same transaction
- builds a real reset URL
- dispatches reset mail through `MailService` after persistence succeeds
- no longer relies on `tokenPreview` for the normal flow

It is acceptable to keep optional debug logging in development, but the contract should be email-based.

### Reset URL Shape

The server should build reset links that target the web app.

Example direction:

- `WEB_APP_URL/reset-password?token=...`

This should be configurable from environment variables.

Minimum new env values:

- `WEB_APP_URL`
- mail transport configuration values

## Web Changes

### API Integration

Replace placeholder auth form actions with real server requests.

The web app should call:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `POST /api/auth/logout`

### Cookie-Based Browser Auth

The web app should use the existing HTTP-only session-cookie model.

That means:

- requests must include credentials
- browser session state should be derived from `/auth/me`
- logout should call the real server endpoint

### UX Expectations

#### Register

- submit to server
- show validation or conflict errors
- optionally redirect to login or auto-login later

#### Login

- submit to server
- on success rely on session cookie
- redirect to dashboard

#### Forgot Password

- submit email
- always show a generic success message
- do not leak whether the email exists

#### Reset Password

- read token from URL
- submit new password to server
- redirect to login on success

## Config And Environment

### Server

Need config for:

- `DATABASE_URL`
- `WEB_APP_URL`
- mail transport settings

### Web

Need config for:

- `NEXT_PUBLIC_API_BASE_URL`

The web app should not hardcode local server URLs.

## Testing

### Server

Add or extend tests for:

- forgot-password creates token and outbox record in one transaction
- forgot-password dispatch marks outbox state correctly
- reset-password works through the final path

### Web

At minimum verify:

- forms hit the real endpoints
- auth errors render correctly
- successful login reaches authenticated state

## Execution Order

1. Add server mail abstraction
2. Add dev mail transport
3. Update forgot/reset backend flow
4. Add web API client/auth actions
5. Connect login/register/forgot/reset pages to server
6. Verify cookie-based auth state on web
