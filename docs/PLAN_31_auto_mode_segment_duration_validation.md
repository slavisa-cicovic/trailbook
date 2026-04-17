# PLAN 31: Auto Mode Segment Duration Validation

## Goal

Improve `Auto` recording so it does not finalize clearly unrealistic short segments, especially:
- `plane` segments shorter than about `30 minutes`
- `drive` segments shorter than about `10-15 minutes`

The intent is not to make auto mode "strictly correct". The intent is to reduce obvious nonsense in the final timeline.

## Why This Is Needed

Current auto mode already uses:
- speed thresholds
- stability windows
- separate inference for `boat`

That is good for live inference, but still not enough for final segment quality.

Example problem:
- short burst of high speed or noisy samples
- app closes one segment and opens another
- result is a final `plane` or `drive` segment that is implausibly short

For real travel logs, users will tolerate small inaccuracies in route geometry. They will not tolerate obviously absurd mode segments.

## Current Integration Points

Relevant existing code:
- `mobile/src/services/recording/auto-recording.service.ts`
  - decides inferred profile
  - closes current segment and opens next one
- `mobile/src/services/trip-segments/trip-segments.service.ts`
  - already owns segment summary/merge logic
  - already has segment duration helpers
  - already supports manual mode edits and merge of adjacent equal modes

This means the right place for the new rule is not in the map UI and not in general trip summary code. It belongs in auto-mode segment finalization/normalization.

## Product Rules

### Plane

- a `plane` segment should not survive if total duration is under `30 minutes`
- if shorter than that, it is considered implausible for V1

Expected fallback:
- downgrade to `drive`
- then allow normal adjacent merge behavior if surrounding segments are also `drive`

Reason:
- sub-30-minute flight segments are practically noise for this app's use case

### Drive

- a `drive` segment should be treated as suspicious if duration is under `10 minutes`
- optionally configurable to `15 minutes` after field testing

Expected fallback:
- do not blindly keep it as separate finalized `drive`
- merge it into surrounding ground mode if that yields a more coherent timeline

Reason:
- short `drive` bursts are possible in real life, but are also a common artifact of imperfect inference

### Boat

- optional V1.1 rule: `boat` under `20 minutes` should also be treated as suspicious
- not required in first implementation if that expands scope too much

Reason:
- ferry/boat use case is important, but the current discussion is primarily about `plane` and `drive`

## Recommended Strategy

Do not enforce these rules at raw sample time.

Do not try to "block the switch" while the app is still collecting points.

Instead:

1. auto inference continues to work as today
2. when an auto-inferred segment is about to be finalized
3. run a normalization pass over recent segments
4. downgrade/merge implausible short segments

This is the right approach because:
- live inference stays simple
- final timeline quality improves
- rules can use full segment duration, not just partial evidence

## Normalization Rules

### Trigger Moments

Run validation/normalization when:
- auto mode closes a segment because of inferred mode change
- trip is paused
- trip is stopped
- paused trip is resumed and old open segment gets finalized

This ensures short bad segments do not survive just because the app never had another chance to normalize them.

### Scope

Only normalize:
- the most recently closed segment
- and its immediate neighbors

Do not reprocess the entire trip on every point update.

That keeps behavior predictable and implementation cheap.

## Proposed Implementation Shape

Add a small normalization layer in `trip-segments.service.ts`.

### New Helper

Something in the shape of:
- `normalizeAutoInferredSegments(...)`

Inputs:
- ordered trip segments
- trip points
- target trip local id
- updatedAt timestamp

Responsibilities:
- inspect recently closed segment duration
- if segment is implausible for its inferred mode:
  - change its mode
  - merge with adjacent equal-mode segments if needed

### Plane Rule

If last closed segment is:
- `recordingProfile === "plane"`
- duration `< 30 min`

then:
- rewrite mode to `drive`
- run same adjacent-merge behavior already used by manual edit logic

### Drive Rule

If last closed segment is:
- `recordingProfile === "drive"`
- duration `< 10 min`

then:
- prefer merge into adjacent non-plane/non-boat ground mode if one side is dominant
- otherwise downgrade to nearest plausible ground mode using recent speed evidence

Pragmatic fallback order:
- previous segment mode if previous exists and is `walk|bike|drive`
- else next segment mode if next exists and is `walk|bike|drive`
- else keep `drive`

This is intentionally conservative. Plane is almost always wrong under 30 min. Drive is more ambiguous.

## Interaction With Existing Manual Editing

Manual segment editing remains the final correction tool.

This feature is only:
- automatic cleanup of clearly bad auto-inferred segments

It must not interfere with:
- later manual mode edits
- existing merge behavior from route-screen segment editing

That means new normalization logic should reuse the same canonical merge mechanics where possible, not invent a parallel segment rewrite path.

## UI / UX Consequences

No new UI is required.

Users should simply see:
- fewer absurd short `plane` segments
- fewer noisy short `drive` segments
- cleaner `Timeline`

No badges, dialogs, or explanation text are needed in this phase.

## Testing Requirements

### Unit / Service-Level

Cover at least:
- short `plane` segment gets downgraded and merged into `drive`
- short `drive` segment merges into surrounding `walk` or `bike` when appropriate
- valid long `plane` segment survives
- valid long `drive` segment survives
- normalization does not alter manually edited non-auto scenarios accidentally

### Manual Validation

Test with realistic scenarios:
- airport transfer with actual flight
- short noisy highway burst that should not become standalone `plane`
- mixed urban walking + short vehicle move
- ferry case to ensure `boat` behavior is not accidentally degraded

## Out of Scope

- full probabilistic transport classification
- ML-based mode recognition
- exact boat duration rule in first pass if it complicates the change too much
- retroactive normalization of all historical trips

## Outcome

After this plan:
- auto mode still stays simple and heuristic-based
- finalized segment timeline becomes more believable
- obvious nonsense like `plane for 6 minutes` is removed automatically
- user still keeps manual segment editing as the final safety valve
