PLAN 29: Multi-Device Restore And Safe Sync

Goal
- Let a signed-in user safely access their synced trips on another device.
- Prevent duplicate server inserts when the same logical trip is synced from multiple local clients.
- Add a clear user-facing restore/import flow instead of relying on accidental local duplication.

Why
- The same account may be used from:
  - Expo Go
  - internal preview build
  - a second phone
- Today the server still treats some sync payload parts as fresh creates.
- If two clients hold local copies of the same trip and both sync, server uniqueness errors can happen.
- Users should be able to move their own trips, waypoints, and photos to another device in a supported way.

Problem Statement
- Current sync is not fully idempotent for all trip child entities.
- Example failure:
  - `tripPoint.create()`
  - unique constraint on `(trip_id, local_source_id)`
- This means the server already has the point, but the client tries to create it again.

Product Direction
- Synced trips become server-backed canonical trips.
- A second device should not “recreate” them blindly.
- Instead:
  - the user logs in
  - the app can fetch server trips
  - the user can explicitly import/restore them locally
  - future sync updates the same canonical records safely

Core Principles
- Server is the canonical source for synced trips.
- Local-only demo trips stay local-only.
- Sync must be idempotent.
- Multi-device restore must be explicit and understandable to the user.
- Photo/media restore must reuse server metadata and server-hosted media content, not duplicate arbitrary local file paths.

Scope
- Safe server sync for:
  - trips
  - segments
  - points
  - waypoints
  - attachments metadata
- Mobile restore/import flow for authenticated users
- Device-local persistence of restored server trips

Out Of Scope
- Real-time bidirectional sync conflict resolution
- Simultaneous offline edits on two devices to the same trip
- Background auto-restore on login without user confirmation
- End-user merge UI for conflicting local and remote copies

Server Work
1. Make sync idempotent
- Replace blind creates with:
  - `upsert`
  - or `find existing then update/create`
- This applies to:
  - trip points
  - segments
  - waypoints
  - attachments metadata
- The server must treat `(parent_id, local_source_id)` as stable identity, not as always-new input.

2. Preserve canonical ownership
- Synced entities stay attached to:
  - owner user
  - server trip id
- A second device for the same user should update the same logical records, not create parallel copies.

3. Add user trip listing/detail APIs suitable for restore
- Example:
  - `GET /trips/mine`
  - `GET /trips/:id`
- The payload must include:
  - trip metadata
  - segments
  - points
  - waypoints
  - attachment metadata
- Photo content can remain lazy-loaded by attachment content endpoint.

4. Mark server records for restore provenance
- Mobile restore needs enough metadata to remember:
  - `serverId`
  - stable local source ids
  - last synced timestamps

Mobile Domain Direction
- Distinguish:
  - local-only trips
  - server-backed trips
- A restored trip should keep:
  - `serverId`
  - entity `serverId`s when available
  - sync status that reflects “already on server”

Restore UX Direction
- Add an explicit authenticated-only action:
  - `Restore from server`
- Best initial location:
  - `Settings`
- Possible later location:
  - empty state after first authenticated login on a fresh device

Restore Flow V1
1. User signs in on a second device.
2. User opens `Settings`.
3. User taps `Restore from server`.
4. App fetches owned server trips.
5. App shows selectable list:
  - all trips
  - maybe date/title summary
6. User chooses one or more trips to import.
7. App saves them into local stores with correct server linkage.
8. Imported photos remain viewable through server content URLs.

Handling Existing Local Data
- If the device already has local trips:
  - do not silently overwrite
- V1 safer rule:
  - import only trips whose `serverId` is not already present locally
  - skip duplicates and show summary:
    - imported count
    - skipped count
- Later we can add smarter reconciliation.

Sync Rules After Restore
- Restored trips sync back to the same server trip ids.
- Child entities must upsert by stable identity.
- No duplicate point creation for existing `(trip_id, local_source_id)` tuples.

Media Restore Direction
- V1:
  - restore attachment metadata
  - show photos through server attachment content endpoints
  - do not eagerly download every image into app-managed local storage
- Later:
  - optional “download media for offline use”

UI Notes
- Settings screen:
  - authenticated-only section
  - `Restore from server`
  - show import progress
  - show results summary
- Trips screen:
  - restored trips should look normal in owned trips
  - no special badge required unless useful for diagnostics

Technical Notes
- The mobile sync client should stop assuming:
  - “missing local serverId means always create everything fresh”
- Server sync endpoints should tolerate repeated payloads from the same logical trip.
- This is especially important while using multiple development clients on the same account.

Testing
Server
- sync same trip twice from same payload
- sync same trip from second client copy
- verify no unique constraint failure
- verify records are updated, not duplicated

Mobile
- authenticated restore on empty device
- restore when some local trips already exist
- restore skipped for already-imported server trips
- restored trip opens normally in route/waypoint/photo views
- restored trip re-sync does not create duplicate child entities

Delivery Order
1. Make server trip child sync idempotent.
2. Add owned trip list/detail restore endpoints.
3. Add mobile restore/import service.
4. Add Settings UI for restore flow.
5. Verify restored trips re-sync cleanly from another client.

Future Follow-Up
- Optional automatic prompt after first authenticated login on a fresh device
- Offline media download for restored trips
- Conflict detection for concurrent multi-device editing
