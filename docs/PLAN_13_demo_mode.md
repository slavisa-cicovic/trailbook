# PLAN 13: Demo Mode

## Goal

Introduce an explicit `demo mode` entry path so the app keeps a public, self-contained way to try core features even after backend authentication is added.

The demo account should remain internal to the app flow:

- username/email: `demo`
- password: `demo`

The current temporary `accept any credentials` behavior will be removed completely.
The visible `Login` action will remain in place for future real authentication, but it will stay disabled for now.

## Why

- Trailbook should remain easy to try without backend setup.
- Demo access must stay available even after real authentication exists.
- Demo users should be modeled explicitly, not as an accidental side effect of a temporary login implementation.
- The login screen should preserve space for future standard auth, roles, and RBAC.

## Scope

This plan includes:

- explicit demo credential validation
- session flagging for demo users
- login screen support for a separate `Enter Demo` action
- removal of the current `any credentials` fallback
- disabled `Login` button reserved for future backend authentication

This plan does not include:

- backend authentication
- server-backed demo accounts
- special demo-only data seeding

## Target Behavior

- Username and password inputs stay visible and empty by default.
- `Login` stays visible but disabled.
- `Enter Demo` logs the user in by internally applying `demo / demo`.
- The app starts a demo session and continues using the existing local-first flow.
- The UI can make it obvious that the user is in demo mode.

## Implementation Steps

### Phase 1: Domain and Session Model

- Add explicit session mode to the identity/session model:
  - `demo`
  - `standard` (reserved for future backend auth)
- Mark the currently supported login path as `demo`

### Phase 2: Auth Service

- Update `temporary-login.service.ts` so it validates only:
  - `demo`
  - `demo`
- Remove the current permissive login behavior entirely.

### Phase 3: Login UX

- Keep the `Login` button in place, but disabled.
- Keep the input fields empty by default.
- Add a separate `Enter Demo` action that internally uses the demo credentials.
- Do not show extra explanatory error copy for disabled standard login.

### Phase 4: App Shell Feedback

- Surface demo state in a lightweight way where useful:
  - account popup
  - settings screen
- Keep it small and non-intrusive.

## Validation

- `demo / demo` logs in successfully.
- Any other credential pair is rejected.
- Existing local persistence and recording flows still work.
- `npm run typecheck --workspace mobile` passes.
