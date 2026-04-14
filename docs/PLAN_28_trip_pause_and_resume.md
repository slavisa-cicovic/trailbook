PLAN 28: Trip Pause And Resume

Goal
- Let the user pause an active trip and later resume it.
- Let the user pause an active trip, start another trip, stop that second trip, and later resume the first one.
- Make pauses visible in the trip timeline without pretending they are travel segments.

Why
- Real travel is rarely one uninterrupted recording session.
- Users often stop for meals, breaks, sightseeing, or detours they do not want mixed into the same continuous movement segment.
- Users also sometimes want to temporarily suspend one trip, record a different trip, then continue the first one.

Core Product Rules
- A trip can be:
  - `active`
  - `paused`
  - `ended`
- Only one trip can be `active` at a time.
- Multiple trips may be `paused`.
- `Pause` closes the current open segment at the pause timestamp.
- `Resume` always opens a new segment at the resume timestamp.
- A pause is not a travel mode and must not be stored as a fake geo segment.

Supported User Flows
1. Pause and resume the same trip
- User starts trip A
- User pauses trip A
- User does nothing else for some time
- User resumes trip A
- Route timeline later shows:
  - travel segment
  - pause entry
  - travel segment

2. Pause one trip, record another, then resume the first
- User starts trip A
- User pauses trip A
- User starts trip B
- User stops trip B
- User resumes trip A
- Route timeline for A shows pause between travel segments
- Route timeline for B stays independent

Out Of Scope
- Auto-detecting pauses without explicit user action
- Converting arbitrary gaps into pause events retroactively
- Editing pause durations manually in V1
- Sync conflict resolution across devices for paused trips

Domain Model Direction
- Keep travel segments as travel-only records:
  - `walk`
  - `bike`
  - `drive`
  - `boat`
  - `plane`
- Add explicit pause records:
  - `TripPause`
    - `localId`
    - `serverId`
    - `tripLocalId`
    - `deviceId`
    - `userId`
    - `startedAt`
    - `endedAt`
    - `createdAt`
    - `updatedAt`
    - `syncStatus`

Trip State
- Add explicit trip status:
  - `active`
  - `paused`
  - `ended`
- Do not try to infer paused state only from `endedAt === null`.
- This matters because an unfinished trip is no longer always the active trip.

Recording Session Model
- Current recording session logic assumes one unfinished trip.
- It must evolve to support:
  - one `activeTripId`
  - one `activeSegmentId`
  - zero or more paused trips in storage
- Resume logic must select a paused trip and create a new active segment for it.

Canonical Data Rules
- `Pause` closes the currently open segment.
- `Resume` creates a new segment even if the mode stays the same.
- Travel distance is calculated only from trip points in travel segments.
- Pause periods carry duration but no path geometry.

UI Requirements
- Recording screen:
  - when a trip is active:
    - show `Pause`
    - show `Stop`
  - when paused trips exist:
    - show a clear way to `Resume`
    - if there are multiple paused trips, let the user choose which one to resume
- Trips screen:
  - show `Paused` badge/state
  - paused trips remain in the owner list
- Route screen:
  - show pause entries in the timeline
  - example:
    - `Drive • 4h 10m`
    - `Pause • 1h 02m`
    - `Drive • 2h 14m`
    - `Boat • 1h 30m`

Route Screen Presentation
- Keep map geometry unchanged:
  - no polyline for pause
- Build a derived timeline view from:
  - travel segments
  - pause events
- Sort both by time and render a combined ordered list

Pause Creation Rules
- On `Pause`:
  - close active segment
  - create `TripPause` with `startedAt = pausedAt`
  - mark trip status as `paused`
  - recording session becomes `idle` or a pause-aware non-recording state with no active trip
- Preferred simpler V1:
  - recording session becomes non-recording
  - paused trip is tracked only in trip data + pause record

Resume Rules
- On `Resume paused trip`:
  - find open pause record for that trip
  - close the pause record with `endedAt = resumedAt`
  - create a new trip segment
  - segment mode:
    - use last known trip mode by default
    - optionally allow immediate mode selection at resume time
  - mark trip status as `active`
  - update recording session to point to the resumed trip and new segment

Start New Trip While Another Trip Is Paused
- Allowed.
- Starting a new trip must fail only if another trip is still `active`, not if others are `paused`.
- Paused trips remain resumable later.

Sync Implications
- Server sync model must eventually include:
  - trip status
  - pause records
- Shared trips should later show pause entries as read-only timeline items too.
- V1 local implementation should be designed so this can be added cleanly later.

Storage And State Changes
- Add:
  - `trip-pauses` store
  - `trip-pauses` storage
- Extend trip domain and storage normalization for trip status.
- Update recording reconciliation so hydration does not blindly resume the most recent unfinished trip.

Testing
- Unit/service tests:
  - pause active trip
  - resume paused trip
  - pause trip A, record trip B, resume A
  - ensure only one active trip at a time
  - ensure resumed segment gets a new segment id
  - ensure pause records have correct start/end timestamps
- UI/manual tests:
  - route timeline shows pause entries
  - paused trip badge visible
  - resume opens same trip, not a new one

Delivery Order
1. Add trip status to domain/storage.
2. Add `TripPause` domain/store/storage.
3. Update recording session orchestration for pause/resume semantics.
4. Add recording screen pause/resume controls.
5. Add route screen derived timeline with pause entries.
6. Add tests for pause/resume flows.

Future Follow-Up
- Resume with optional mode picker
- Auto-suggest pauses from long no-movement gaps
- Include pause entries in shared trip read-only timeline
