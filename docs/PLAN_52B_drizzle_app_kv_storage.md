# PLAN 52B: Drizzle App KV Storage

## Goal

Migrate the shared mobile `app_kv` JSON storage primitive to Drizzle while preserving the existing public API used by recording, theme, config and one-time migration helpers.

This is intentionally a low-risk migration step before moving relationship-heavy storage modules.

## Implementation Status

Implemented: 2026-06-05

- Added `mobile/src/storage/app-kv-storage.ts` backed by Drizzle.
- Updated recording, recording config, theme and one-time migration storage callers to use the new module.
- Removed the old hand-written `app_kv` SQL helpers from `mobile/src/storage/sqlite/db.ts`.
- Added contract tests for missing keys, object values, primitive values, updates and deletion.

## Context

`PLAN_52A` added the Drizzle migration baseline and startup migration runner.

The current `app_kv` implementation lives in `mobile/src/storage/sqlite/db.ts`:

- `loadJsonRecord<T>(storageKey)`
- `saveJsonRecord<T>(storageKey, value)`

Current callers include:

- `mobile/src/storage/recording-storage.ts`
- `mobile/src/storage/recording-config-storage.ts`
- `mobile/src/storage/theme-storage.ts`
- `mobile/src/storage/sqlite/migrate-once.ts`

The table is already present in the Drizzle schema mirror:

```text
app_kv(storage_key, json_value, updated_at)
```

## Non-Goals

- Do not change the `app_kv` table schema.
- Do not change the JSON payload format.
- Do not move callers to Drizzle directly.
- Do not change recording/session semantics.
- Do not remove the legacy SQLite migrator.
- Do not touch hot-path recording tables.

## Design

Keep `loadJsonRecord` and `saveJsonRecord` as the public API for now.

Internally, move their implementation from hand-written SQL to Drizzle:

```text
callers
  -> loadJsonRecord / saveJsonRecord
  -> Drizzle app_kv implementation
  -> expo-sqlite
```

This keeps the rest of the app stable while validating Drizzle for a shared primitive.

## Implementation Steps

### Step 1: Add Dedicated App KV Storage Module

Create a Drizzle-backed module, for example:

```text
mobile/src/storage/app-kv-storage.ts
```

or, if we want to keep it clearly under the Drizzle migration work:

```text
mobile/src/storage/drizzle/app-kv-storage.ts
```

The module should expose:

```ts
export async function loadJsonRecord<T>(storageKey: string): Promise<T | null>
export async function saveJsonRecord<T>(storageKey: string, value: T | null): Promise<void>
```

Acceptance:

- API stays compatible with current callers.
- `null` still deletes the row.
- JSON parse/stringify behavior stays unchanged.

### Step 2: Use Drizzle Queries

Implement reads with typed Drizzle select against `schema.appKv`.

Implement writes with one of:

- `insert(...).values(...).onConflictDoUpdate(...)`
- delete for `value === null`

Acceptance:

- `updated_at` is written as ISO string.
- `storage_key` remains the primary key.
- no caller needs SQL strings.

### Step 3: Keep Write Serialization

`saveJsonRecord` currently uses `runExclusiveDatabaseWrite`.

Preserve serialized writes by using `runExclusiveDrizzleWrite`, because this storage is used by session/config flows and should not race with other SQLite writes.

Acceptance:

- writes still go through the shared DB write queue.
- no new independent SQLite writer is introduced.

### Step 4: Re-export From Existing Location

To minimize churn, keep or re-export the API from `mobile/src/storage/sqlite/db.ts`.

Options:

1. Move implementation to `mobile/src/storage/app-kv-storage.ts` and import/re-export in `sqlite/db.ts`.
2. Update all callers to import from the new module.

Preferred first step:

- option 1, because it keeps the diff smaller and avoids unrelated import churn.

Acceptance:

- current callers compile without changes.
- future work can move imports to the new module gradually.

### Step 5: Tests

Add focused tests for:

- missing key returns `null`
- saving object and loading it returns same value
- saving primitive values still works
- saving `null` deletes the key
- updating an existing key replaces JSON and `updated_at`

If Expo SQLite is difficult to exercise in unit tests, add tests at the mapping/contract layer and document remaining manual verification.

Acceptance:

- tests cover the public API contract, not Drizzle internals.

## Testing

Run:

```bash
npm run typecheck --workspace mobile
npm run lint --workspace mobile
npm test --workspace mobile
npx drizzle-kit check --config=drizzle.config.ts
```

Manual smoke test:

1. Launch app.
2. Verify theme persists after restart.
3. Start recording, stop recording, restart app.
4. Verify no stale active session remains unless recording is genuinely active.
5. Open recording config/settings and verify cached config still loads.

## Risks

- `migrate-once.ts` uses `app_kv`; if Drizzle initialization depends on a one-time migration that itself depends on `app_kv`, this can create subtle startup ordering issues.
- `saveJsonRecord` is used by recording/session code; write serialization must remain intact.
- JSON values are untyped at storage boundary; this plan does not solve runtime validation.

## Rollback

Rollback is simple:

- keep the `app_kv` table unchanged
- restore `loadJsonRecord` / `saveJsonRecord` SQL implementation in `sqlite/db.ts`
- remove the Drizzle-backed implementation module

No data migration is required.
