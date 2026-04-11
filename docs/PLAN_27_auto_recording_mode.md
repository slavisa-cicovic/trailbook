PLAN 27: Auto Recording Mode

Goal
- Add an `Auto` recording mode in which the app infers the current travel mode and creates trip segments automatically.
- Keep automatic segmentation conservative so it is useful by default and does not constantly flip modes.
- Preserve the existing manual segment editing flow as the correction mechanism after recording.

Why
- Users should not need to manually change the mode during every trip.
- A good-enough inferred segmentation is more valuable than a perfect but never-finished solution.
- The existing segment editing feature already gives users a safe way to fix mistakes after recording.

Scope
- Mobile only.
- Applies to active trip recording.
- Affects:
  - recording mode selection UI
  - recording session model
  - background/foreground location processing
  - segment rollover logic
- The app continues to support manual modes:
  - `walk`
  - `bike`
  - `drive`
  - `boat`
  - `plane`

Out Of Scope
- Machine learning activity recognition.
- OS activity APIs as a required dependency.
- Perfectly precise ferry/boat route geometry.
- Automatic post-hoc cleanup of all false positives without user review.

User Experience
- Recording start dialog gets a new mode:
  - `Auto`
- While recording in `Auto`, the app:
  - samples speed from recorded trip points
  - infers the likely current mode
  - opens a new segment only after the inferred mode remains stable long enough
- The user can still manually change/correct segment modes later on the route screen.

Product Principle
- In `Auto`, segment mode changes should happen late rather than early.
- A slightly delayed segment change is acceptable.
- A noisy mode flip every minute is not acceptable.

Heuristic Rules
- Long time below about `6 km/h`:
  - infer `walk`
- Stable motion around about `10-35 km/h`:
  - infer `bike`
- Stable motion above about `35-40 km/h`:
  - infer `drive`
- Extremely high sustained speed:
  - infer `plane`

Boat Heuristic
- Boat is the hardest mode to infer reliably from GPS alone.
- Exact route precision is not required for the target use case.
- It is sufficient that the trip visibly contains a separate `Boat` segment with approximate duration and distance.

Pragmatic Boat Rule
- `Boat` should be inferred only conservatively.
- Preferred heuristic:
  - sustained medium/high speed for a long window
  - low direction-change frequency
  - long uninterrupted movement
  - weak fit for `bike`
  - weak fit for `drive` because of long water crossing style movement
- The first implementation should bias toward:
  - infering `drive` if uncertain
  - infering `boat` only after a stronger confidence threshold

Example Use Case
- User drives to Igoumenitsa
- boards a ferry to Corfu
- continues driving or walking on Corfu

Desired result:
- separate `Drive` segment before ferry
- separate `Boat` segment for the ferry crossing
- separate next segment after arrival

It is acceptable if:
- the exact ferry path is not perfectly precise
- the distance is approximate

It is not acceptable if:
- the ferry part is merged into the whole road trip with no distinct segment

Inference Model
- Auto mode should not classify on a single point.
- Use a rolling window over recent trip points.
- Use derived metrics:
  - median speed
  - max speed
  - duration of stable speed band
  - number of samples in band
  - simple heading-change stability when available

Recommended Threshold Strategy
- `walk`
  - median speed below `6 km/h`
  - stable for at least `5-10 minutes`
- `bike`
  - median speed roughly `10-35 km/h`
  - stable for at least `5-10 minutes`
- `drive`
  - median speed above `35-40 km/h`
  - stable for at least `5-10 minutes`
- `plane`
  - very high sustained speed
  - classify faster than other modes once clearly above a flight threshold
- `boat`
  - sustained crossing-style movement
  - stable for longer than `drive`
  - only switch when confidence is clearly above `drive`

State Model Changes
- Extend `RecordingProfile` with:
  - `auto`
- Keep actual stored trip segments canonical as concrete modes:
  - `walk`
  - `bike`
  - `drive`
  - `boat`
  - `plane`
- Recording session needs auto-mode runtime state such as:
  - current inferred mode
  - candidate inferred mode
  - candidate since timestamp
  - recent speed samples window

Canonical Data Rule
- A trip started in `Auto` should still persist normal concrete segments.
- `Auto` is a runtime recording strategy, not a persisted segment type.
- Segment records stored in trips must remain concrete travel modes.

Implementation Strategy
1. Add `auto` as a selectable recording mode in the start/change mode UI.
2. Extend recording session state with auto inference runtime fields.
3. Add a small inference service:
  - consumes recent trip points
  - outputs candidate concrete mode
4. Add segment rollover rule:
  - change segment only when candidate mode stays stable long enough
5. Keep a hysteresis rule:
  - do not immediately flip back after one noisy sample
6. Reuse the existing manual segment editing UI for corrections after recording.

Mode Transition Rules
- Do not open a new segment on every inferred change.
- Open a new segment only when:
  - candidate mode differs from current segment mode
  - candidate mode remains stable for threshold duration
  - enough samples support the candidate
- After switching:
  - reset candidate mode state
  - continue collecting samples for the next possible transition

Conservative Defaults
- Prefer under-segmentation over over-segmentation.
- If confidence is low:
  - stay in the current mode
- If current mode is unknown early in recording:
  - start as `walk`
  - then promote to a faster mode only after threshold stability

Manual Correction Path
- Route screen segment mode editing remains the primary correction tool.
- Auto mode is acceptable only if a user can later:
  - see the inferred segments clearly
  - fix wrong modes quickly
  - merge segments naturally through mode edits

Testing
- Unit tests for inference helper:
  - long low-speed window -> `walk`
  - stable medium-speed window -> `bike`
  - stable high-speed window -> `drive`
  - flight-like speed window -> `plane`
  - ambiguous road/ferry case -> no premature `boat`
  - clear ferry-style sustained movement -> `boat`
- Integration tests for segment rollover:
  - no rapid mode flapping
  - delayed but stable transition
  - correct concrete segments created from `Auto`
- Manual field testing:
  - city walk
  - bike ride
  - highway drive
  - ferry crossing
  - flight

Delivery Order
1. Add `auto` to domain/constants/UI.
2. Add recording-session runtime inference state.
3. Implement inference helper over recent speed samples.
4. Wire foreground recording flow to segment rollover decisions.
5. Wire background recording flow to the same inference logic.
6. Verify route screen output and segment editing compatibility.

Future Follow-Up
- Add optional `Auto (beta)` label in the UI.
- Add debug telemetry screen for inferred mode decisions during testing.
- Consider OS activity APIs later only if GPS heuristics prove too weak.
