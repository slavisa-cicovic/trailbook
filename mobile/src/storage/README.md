# Mobile Storage

This folder contains storage implementation details. App screens, controllers and most services should prefer the repository layer in `../repositories` instead of importing table storage modules directly.

## Current Split

- `drizzle/schema.ts` is the typed SQLite schema mirror.
- `sqlite/db.ts` still owns runtime database opening and legacy `PRAGMA user_version` migrations.
- Drizzle-backed storage modules use `getDrizzleDatabase()` for reads and `runExclusiveDrizzleWrite()` for writes.
- `trip-points-storage.ts` and `raw-location-events-storage.ts` are intentional raw SQL hot paths.
- `sqlite/migrate-once.ts` supports one-time migration from old AsyncStorage-backed data.

## Migration Ownership

Until migration ownership changes, every schema change must update both:

- `sqlite/db.ts` legacy migration path and `DATABASE_VERSION`
- `drizzle/schema.ts` mirror and schema contract tests

Add a bundled Drizzle migration only when the change is explicitly post-baseline Drizzle-owned.

## Import Rule

Storage modules may import other storage modules when they are part of the same persistence implementation.

Feature code should use repositories when an equivalent repository exists. Direct storage imports are still acceptable for app infrastructure such as session, recording config, theme, benchmark/debug tools and low-level recording engine code where the storage API is the intended boundary.

