# PLAN 41: Location Callback Observability

## Goal

Add reliable diagnostics around location delivery so we can distinguish between:
- the operating system not delivering location updates
- our recording pipeline receiving updates but dropping them
- our background path failing to persist accepted updates

The purpose of this plan is observability, not product UI.

## Why

Recent paired Android / iOS trip tests show a recurring pattern:
- Android often records dramatically fewer points than iOS
- sometimes iOS also loses parts of the route
- auto-mode inference is not currently the main blocker because in several cases there are not enough recorded points to infer anything confidently

At the moment we do not have enough evidence to answer the key question:

- did the OS fail to deliver updates?
- or did the app receive them and reject them?

Without that distinction, further tuning is mostly guesswork.

## Core decision

We should log every incoming location callback from the OS, not just accepted trip points.

That means recording diagnostics at two layers:

1. OS callback layer
- every foreground/background location delivery

2. trip point decision layer
- whether the callback became a persisted trip point
- or why it was rejected

Both layers are required.

## Scope

V1 observability should cover:
- foreground location watch callbacks
- background task callbacks
- accepted/rejected decision result
- per-trip in-memory diagnostics summary
- optional console logging in debug/dev builds

V1 should not include:
- production telemetry shipping
- server-side diagnostics upload
- user-facing diagnostics UI
- long-term persistent logs

## What to capture

For every incoming location callback from the OS, capture:

- `tripLocalId`
- `recordingMode`
- `source`
  - `foreground`
  - `background`
- `receivedAt`
  - time the callback reached our app
- `recordedAt`
  - timestamp from the location payload
- `latitude`
- `longitude`
- `accuracy`
- `speed`
- `altitude`
- `segmentLocalId`
  - if available

Then capture the app decision:

- `accepted`
- or rejected with explicit reason:
  - `duplicate-timestamp`
  - `duplicate-coordinates`
  - `accuracy`
  - `min-movement`
  - `jump-distance`
  - `implied-speed`

## Diagnostics model

Add a lightweight diagnostics event type such as:

```ts
type LocationCallbackDiagnostic = {
  tripLocalId: string;
  recordingMode: RecordingMode;
  source: "foreground" | "background";
  receivedAt: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  segmentLocalId: string | null;
  decision: "accepted" | "rejected";
  rejectionReason?: string;
};
```

Also maintain per-trip aggregate counters:

- total callbacks received
- foreground callback count
- background callback count
- accepted count
- rejected count by reason
- max callback gap
- average callback gap

## Storage strategy

Use a bounded in-memory buffer.

Recommended V1:
- keep the last `500` or `1000` callback events per trip
- keep a lightweight summary object per trip

Why:
- enough for debugging a single test ride
- low implementation cost
- no migration or persistence complexity

Optional:
- expose a `flushSummary(tripLocalId)` helper on stop/pause

## Integration points

### Foreground path

In the foreground watch callback path:
- log the raw callback before any filtering
- then log the accept/reject result

### Background path

In the background task:
- log each delivered location event before filtering
- then log the accept/reject result

This is especially important because background loss is one of the main suspects.

### Existing point diagnostics

We already added point rejection counters earlier.

This plan should absorb or extend that work rather than duplicating it:
- keep the existing rejection reason taxonomy
- add the missing raw callback layer on top

## Output format

V1 should support two outputs:

1. live debug logs
- concise console output during development

2. final per-trip summary
- log on:
  - stop
  - pause
  - maybe app background transition if helpful

Example summary:

```txt
[location-diagnostics] trip=... mode=auto
callbacks total=128 foreground=84 background=44
accepted=76
rejected accuracy=12 min-movement=24 jump-distance=7 implied-speed=9
maxGapSec=138 avgGapSec=17
```

## Delivery slices

### Slice 1: Diagnostics model

Create a new diagnostics service for raw callback events and summaries.

Suggested file:
- `mobile/src/services/location/location-diagnostics.service.ts`

### Slice 2: Foreground hook-in

Instrument the foreground location watch path.

### Slice 3: Background hook-in

Instrument the background recording task.

### Slice 4: Accept/reject correlation

Connect raw callback events with point filtering outcomes so every callback has a decision.

### Slice 5: Final summary logging

On `Pause` / `Stop`, emit a trip-level summary snapshot.

### Slice 6: Cleanup / limits

Ensure:
- bounded buffers
- easy reset per trip
- no unbounded memory growth

## Risks

1. Too much log noise
- mitigate with bounded summaries and concise structured logs

2. Diagnostics themselves can affect timing
- keep payloads small
- avoid expensive serialization in hot paths

3. Foreground/background events may be hard to correlate
- this is why the event shape must include:
  - trip id
  - receivedAt
  - recordedAt
  - source

## Acceptance criteria

- every incoming OS location callback is observable in diagnostics
- diagnostics show whether the callback came from foreground or background
- we can see whether each callback was accepted or rejected
- rejection reasons are explicit
- stop/pause logs a useful per-trip summary
- the implementation is bounded and debug-focused, not production telemetry

## Relevant existing code

- `mobile/src/services/location/location.service.ts`
- `mobile/src/services/recording/recording.service.ts`
- `mobile/src/services/recording/background-recording-task.ts`
- `mobile/src/services/trip-points/trip-points.service.ts`
- `mobile/src/services/trip-points/trip-point-diagnostics.service.ts`
- `mobile/src/screens/recording/recording-screen.tsx`
