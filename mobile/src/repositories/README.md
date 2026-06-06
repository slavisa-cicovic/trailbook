# Mobile Repositories

Repositories are the public persistence boundary for screens, controllers and domain services.

They hide whether a table is implemented through Drizzle, raw SQL or another storage mechanism. This keeps storage migrations local to the storage layer.

## Rules

- Prefer importing repositories from app feature code.
- Do not import Drizzle directly outside storage modules.
- Thin re-export repositories are intentional when they preserve a stable boundary.
- Repository modules may compose multiple storage modules for cross-table reads or write workflows.
- Storage implementation details must not leak above this layer.

## Exceptions

Direct storage imports are acceptable for:

- session, device, theme and recording configuration infrastructure
- low-level recording engine and raw-event reprocessing code
- tests that exercise storage contracts directly
- debug and benchmark tooling

