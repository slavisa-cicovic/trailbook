# PLAN 78: Translation Coverage and Stable Error Codes

## Goal

Make every user-facing Trailbook string localizable and prevent untranslated
copy from entering the mobile app, web app, or API error flow.

The final architecture must have these boundaries:

- UI layers render translation keys in the selected language;
- mobile core returns stable error codes and parameters, not English copy;
- the server returns stable error codes and safe parameters, not copy that a
  client is expected to display;
- clients own the final user-facing wording;
- internal diagnostic messages may remain in logs, but must not cross a
  user-facing boundary;
- automated checks fail when a locale is incomplete, interpolation parameters
  differ, or new hard-coded UI copy is introduced.

Supported languages remain:

```text
en
sr-Latn
it
es
de
fr
```

## Status

Phase 1 is complete. Phase 2 is next.

Audit baseline on September 18, 2026:

- the mobile runtime catalog contains 374 English keys;
- Serbian covers all runtime keys;
- Italian, Spanish, German and French each lacked the same three login keys;
- native iOS/Android locale JSON files have matching key structures;
- 72 static hard-coded mobile UI strings are present in 11 TSX files;
- the server has 116 Nest HTTP-exception construction sites across 14 files;
- mobile core has 13 direct `Error` construction sites and 92 `err(...)`
  return sites; these require classification because many pass English text
  through the domain boundary;
- purchase flows already use several stable server codes and provide the
  migration pattern for the rest of the application;
- web public pages contain localized copy, but it is distributed across
  component-local objects rather than one testable catalog;
- authenticated web pages are currently English-only and contain hard-coded
  labels.

Initial automated coverage added by this plan:

- exact runtime-key parity for all mobile languages;
- interpolation-parameter parity for every translated value;
- non-empty translation values;
- exact native-locale JSON key parity;
- a hard-coded mobile UI baseline that rejects any new static copy while the
  existing inventory is being migrated.

## Decisions

- English is the source catalog for translation keys, but a shipped language
  must not silently rely on English fallback for a missing key.
- Runtime translations and native permission translations remain separate:
  `mobile/src/i18n` owns runtime copy and `mobile/locales` owns native metadata.
- Translation keys use stable domain-oriented names such as
  `waypoint.edit.title` and `error.trip.notFound`.
- UI components call `t(key, params)`; repositories, use cases and data sources
  never call the translation store.
- Error codes use upper snake case and describe the condition rather than the
  current wording, for example `TRIP_NOT_FOUND`.
- Dynamic values travel as safe structured parameters, not interpolated
  English sentences.
- HTTP status and domain code are separate. Multiple domain codes may share an
  HTTP status.
- Unknown codes use a localized generic fallback and remain visible in
  diagnostics for support.
- Developer-only screens should use translation keys when they are reachable
  from the application. Test-only controls may be explicitly exempted.
- Brand names, units and user-entered content are not translation defects.

## Non-Goals

- Do not translate logs, stack traces, database fields or third-party payloads.
- Do not translate user-entered trip, group, waypoint or note content.
- Do not return localized server responses based on request language.
- Do not introduce a translation management SaaS in this work.
- Do not redesign screens while replacing their copy.
- Do not share one runtime package between mobile and web until both clients
  have stable catalog boundaries; sharing error-code constants can be assessed
  separately.

## Translation Sources

### Mobile runtime catalog

Source files:

```text
mobile/src/i18n/translations.ts
mobile/src/i18n/purchaseTranslations.ts
```

Requirements:

- every supported language has exactly the English key set;
- no translation value is empty or whitespace-only;
- every locale uses the same `{{parameter}}` names as English;
- adding an English key requires adding all five translations in the same
  change;
- runtime lookup must not hide an incomplete shipped catalog with fallback.

### Native application metadata

Source files:

```text
mobile/locales/en.json
mobile/locales/sr.json
mobile/locales/it.json
mobile/locales/es.json
mobile/locales/de.json
mobile/locales/fr.json
```

These include app names and operating-system permission descriptions. Tests
must compare their recursive key paths and reject empty values.

### Web copy

Current public web copy is held in:

```text
web/src/components/public/landing-page.tsx
web/src/components/public/help-page.tsx
web/src/components/public/public-shell.tsx
```

Move it into typed per-language catalogs before enforcing web-wide key parity.
Authenticated web screens need an explicit product decision: either support all
six languages or clearly remain an English-only admin surface. Public and
signed-in user pages must not mix languages accidentally.

## Current Mobile UI Inventory

The first migration batch is user-facing waypoint and startup copy:

```text
mobile/app/_layout.tsx
mobile/app/auth/callback.tsx
mobile/src/feature/waypoint/WaypointDetailScreen.tsx
mobile/src/feature/waypoint/WaypointPhotoViewerScreen.tsx
mobile/src/feature/waypoint/components/EditWaypointSheet.tsx
mobile/src/feature/waypoint/components/WaypointPhotoViewer.tsx
```

Examples include:

```text
Something went wrong
Try again
Completing sign in...
Go back
Waypoint
Photos
Add photo(s)
No photos yet
Edit waypoint
What should this waypoint be called?
Waypoint note
Photo unavailable · Retry
```

The second batch contains technical or development copy that still needs an
explicit decision rather than silently bypassing localization:

```text
mobile/src/feature/purchases/PurchasesSimulationScreen.tsx
mobile/src/feature/trips/TripDetailScreen.tsx
mobile/src/feature/recording/RecordingScreen.tsx
mobile/src/feature/settings/SettingsScreen.tsx
mobile/src/feature/trips/components/TotalCard.tsx
```

`Trailbook`, `E2E`, `KM` and `user@example.com` may be exempted when they are a
brand, test marker, unit or example value. Accessibility labels remain
user-facing and must be translated even when their corresponding control is
test-only.

## Error Contract

### Server response

Expected API error shape:

```json
{
  "statusCode": 404,
  "code": "TRIP_NOT_FOUND",
  "params": {
    "tripId": "optional-safe-identifier"
  }
}
```

Rules:

- `code` is required for application errors returned by the API;
- `params` is optional and must contain only values safe for client display or
  diagnostics;
- validation may return a list of structured field errors;
- raw database, storage, authentication-provider and store messages never pass
  through;
- a server log entry may contain a private diagnostic message and cause;
- a global exception filter maps unexpected failures to
  `INTERNAL_SERVER_ERROR` without exposing the cause.

Initial shared code families should include:

```text
AUTH_*
ACCOUNT_*
TRIP_*
TRIP_GROUP_*
WAYPOINT_*
PHOTO_*
PURCHASE_*
APPLE_*
GOOGLE_*
VALIDATION_*
INTERNAL_*
```

Existing purchase codes remain stable. New aliases should only be introduced
when an existing name is misleading.

### Mobile core result

Replace string-only errors:

```ts
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

with a structured application error:

```ts
interface AppError {
  code: AppErrorCode;
  params?: Record<string, string | number>;
  diagnostic?: string;
}

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };
```

`diagnostic` is for logs/support and must never be rendered directly. UI maps
`AppErrorCode` to a `TranslationKey` and supplies `params` to `t()`.

Network boundaries must parse server `{ code, params }`. They must map timeout,
offline, invalid-response and unknown-server conditions to local codes such as:

```text
NETWORK_TIMEOUT
NETWORK_UNAVAILABLE
SESSION_EXPIRED
SERVER_UNAVAILABLE
UNKNOWN_ERROR
```

### Web clients

Web API helpers must preserve `code` and `params` rather than throwing only an
English `Error.message`. User-facing web screens localize known codes and use a
safe fallback for unknown ones.

## Phase 1: Coverage Tests and Baseline

Status: Done on September 18, 2026.

- Make every mobile runtime language a complete `Record<TranslationKey,
  string>`.
- Add the missing login translations.
- Add a test for exact key parity, non-empty values and placeholder parity.
- Add a test for recursive native-locale key parity.
- Add a TypeScript-AST scan for static TSX copy.
- Record current hard-coded UI findings as a temporary audited baseline.
- Fail when new hard-coded copy is introduced.
- Add a focused `npm run test:i18n --workspace mobile` command.

The audited baseline is temporary. Every migrated literal must also be removed
from the baseline in the same change.

## Phase 2: Remove Hard-Coded Mobile UI Copy

Migrate in small screen-level changes:

1. startup boundary and OAuth callback;
2. waypoint edit and detail screens;
3. waypoint photo viewer;
4. developer purchase simulation screen;
5. remaining accessibility labels, units and test controls.

For each batch:

- add semantic keys to English;
- add real translations for all languages;
- replace literals with `t()`;
- remove the corresponding baseline entries;
- verify the screen in English and Serbian;
- run catalog and type checks.

Phase completion requires a zero-entry hard-coded-copy baseline for production
screens.

## Phase 3: Structured Mobile Core Errors

- Introduce `AppError`, `AppErrorCode` and parameter types in core.
- Change `Result<T>` and helpers to carry `AppError`.
- Migrate API/network errors first.
- Migrate trip groups, trip repository, photo storage, database bootstrap and
  recording policies by domain.
- Preserve diagnostic causes for logs without exposing them to UI.
- Replace substring matching in `localizeError()` with an exhaustive code map.
- Add tests that every UI-visible code maps to a translation key.
- Remove English constants such as session/network/server messages from core.

Migration must remain type-safe: a repository cannot return an arbitrary
string once its domain has moved to structured errors.

## Phase 4: Structured Server Errors

- Add a small server error-code module and a consistent exception factory or
  typed exception class.
- Add a global exception filter for stable serialization.
- Preserve existing purchase error codes.
- Migrate trip groups first because their English errors are already known to
  leak through mobile sync.
- Migrate trips and waypoint images.
- Migrate authentication and account deletion.
- Migrate purchase validation and notification endpoints.
- Keep infrastructure configuration failures private and return a generic
  stable code.
- Add controller/integration tests that assert status, code and safe params.
- Add a static test that rejects uncoded public Nest exceptions after the
  migration baseline reaches zero.

Representative replacements:

```text
"Group title is required"              -> TRIP_GROUP_TITLE_REQUIRED
"Group not found"                      -> TRIP_GROUP_NOT_FOUND
"Trip must be synced before grouping"  -> TRIP_GROUP_TRIP_NOT_SYNCED
"Trip not found"                       -> TRIP_NOT_FOUND
"Recipient user not found"             -> SHARE_RECIPIENT_NOT_FOUND
"Access denied"                        -> RESOURCE_ACCESS_DENIED
```

## Phase 5: Consume Codes in Mobile and Web

- Parse `{ code, params }` in the mobile API client.
- Map all supported server codes to mobile translation keys.
- Replace message substring checks with exact code switches.
- Preserve an `UNKNOWN_ERROR` fallback and diagnostic code display where
  support needs it.
- Update authenticated web API helpers to preserve structured errors.
- Add localized web presentation where the page supports language selection.
- Verify old server/new client and new server/old client rollout behavior until
  both deployed versions use the structured contract.

## Phase 6: Consolidate Web Catalogs

- Move public landing/help/shell dictionaries out of component bodies.
- Define one typed `PublicTranslationKey` source catalog.
- Require exact keys and interpolation parameters for all public languages.
- Decide the supported language boundary for login, trips and admin pages.
- Add a web hard-coded-copy scanner with explicit exemptions for metadata,
  brand names and code examples.
- Add the web checks to `npm test --workspace web`.

## Phase 7: CI Enforcement

Required checks before merge:

```text
npm run test:i18n --workspace mobile
npm run typecheck --workspace mobile
npm run test:processing --workspace mobile
npm test --workspace server
npm test --workspace web
```

Once each migration baseline reaches zero:

- remove its temporary allowlist;
- reject every static user-facing literal in production UI;
- reject every public server exception without a code;
- reject every mobile core `Result` carrying raw string errors;
- require a translation mapping for every client-visible error code.

## Test Matrix

### Catalog tests

- missing locale key fails;
- extra locale key fails;
- empty translation fails;
- missing or renamed interpolation parameter fails;
- missing native permission key fails;
- a newly supported language without both catalogs fails.

### UI-copy tests

- JSX text literal fails unless explicitly audited;
- literal `title`, `subtitle`, `label`, `message`, `placeholder`,
  `accessibilityLabel` or `accessibilityHint` fails unless explicitly audited;
- translated calls and user-provided content pass;
- removing a literal requires removing its baseline entry.

### Error-contract tests

- known server errors return the expected HTTP status and code;
- unexpected server failures return `INTERNAL_SERVER_ERROR` without internals;
- mobile parses code and safe params;
- every UI-visible code has a translation key in all languages;
- unknown codes show localized generic copy;
- diagnostics never become visible copy;
- no client behavior depends on an English substring.

## Acceptance Criteria

- all six mobile runtime catalogs have identical keys and placeholders;
- all six native locale files have identical recursive key paths;
- production mobile screens contain no unaudited hard-coded user-facing copy;
- server application errors expose stable codes and safe parameters;
- mobile core returns structured errors rather than English messages;
- mobile and localized web pages translate error codes at the presentation
  boundary;
- missing translations, placeholder drift, new UI literals and uncoded public
  errors fail automated checks;
- English fallback is used only for explicitly unsupported external content,
  never to hide a missing shipped translation;
- logs retain enough diagnostic context without exposing internals to users.
