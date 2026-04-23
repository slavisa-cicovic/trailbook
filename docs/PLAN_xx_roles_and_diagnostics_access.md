# PLAN xx: Roles And Diagnostics Access

## Goal

Introduce a simple role model that can later control access to web features, diagnostics, and test-only behavior.

This is a placeholder plan.
It should receive a real plan number when implementation starts.

## Context

Trip diagnostics are required during active field testing.
They are especially useful for comparing Android and iOS behavior, background callback reliability, foreground fallback behavior, and point filtering decisions.

Diagnostics should not be a permanent always-on feature for every production user.
The expected direction is to keep diagnostics available only for users that are explicitly allowed to participate in testing.

## Initial Roles

The initial role names to support are:

- `user`
- `web-user`
- `test-user`
- `admin`

## Product Decisions

Diagnostics must remain supported.

Access to diagnostics should later be controlled through roles, not only through build-time or server-wide environment flags.

Recommended future behavior:

- `test-user` can upload and inspect trip diagnostics.
- `admin` can inspect diagnostics for support and debugging.
- `user` should not upload diagnostics by default.
- `web-user` should only receive web access capabilities unless combined with another role.

## Non-goals

- Do not implement roles in this placeholder plan.
- Do not redesign authentication in this placeholder plan.
- Do not remove the current diagnostics feature flags yet.
- Do not decide final UI permissions here.

## Future Implementation Notes

When this plan is implemented:

- Add persisted user roles on the server.
- Include roles in authenticated user/session responses.
- Keep server-side authorization as the source of truth.
- Make mobile diagnostics upload depend on server-provided recording/config capabilities.
- Keep `ENABLE_TRIP_DIAGNOSTICS` as a temporary global kill switch until role-based diagnostics is proven.
- Add tests that verify diagnostics are accepted only for allowed roles.

