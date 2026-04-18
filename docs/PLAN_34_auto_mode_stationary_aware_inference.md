PLAN 34: Auto Mode Stationary-Aware Inference

Goal
- Improve auto mode so short stops do not corrupt transport mode detection.
- Prevent `drive` or `bike` from being downgraded just because the user is temporarily stationary.

Problem
- Current auto mode can be misled if raw average speed includes stationary time.
- Real-world pauses such as:
  - traffic lights
  - toll booths
  - border crossings
  - fuel stops
  - short breaks
  can sharply reduce average speed inside the inference window.
- That can produce false mode switches such as `drive -> walk` or `drive -> bike`.

Desired Behavior
- Auto mode should reason primarily about movement behavior, not elapsed wall-clock time with no movement.
- Short stationary periods inside an otherwise continuous `drive` or `bike` section should not create a mode change.
- A trip can remain in the same inferred mode while temporarily stopped.

Core Principle
- Infer transport mode from `moving samples`, not from naive average speed over the full time window.

Product Rules
- Temporary stopping does not by itself imply a mode change.
- `Drive` remains `drive` through short stationary intervals if surrounding movement still looks like driving.
- `Bike` remains `bike` through short stationary intervals if surrounding movement still looks like cycling.
- Long enough stationary periods may later become a separate pause concept, but should not immediately force a transport reclassification in V1.

Relevant Existing Code
- `mobile/src/services/recording/auto-recording.service.ts`
- `mobile/src/services/location/location.service.ts`
- `mobile/src/services/trip-points/trip-points.service.ts`
- `mobile/src/services/trip-segments/trip-segments.service.ts`

Current Weakness
- Auto inference currently leans too much on speed windows that can be diluted by low-movement or stationary samples.
- We need a distinction between:
  - `moving sample`
  - `stationary sample`

Proposed Model
1. Classify each recent sample as:
- `moving`
- `stationary`

2. Use only `moving` samples to compute:
- median moving speed
- trimmed moving speed
- mode confidence

3. Ignore stationary samples for direct mode switching.

4. Keep hysteresis:
- do not switch modes unless enough moving evidence accumulates for the candidate mode

Stationary Detection
- A sample/window is `stationary` if:
  - movement over the interval is below a small threshold
  - or implied speed is below a low threshold
- Suggested initial threshold:
  - below roughly `1.5-2.0 km/h`
  - or movement below a few meters over the sampling interval

Inference Changes
- Replace raw average speed over full window with:
  - median speed of moving samples
  - plus count of moving samples supporting the candidate mode
- If the recent window is mostly stationary:
  - keep the current mode
  - do not open a new candidate mode solely from that

Example Outcomes
- `Drive -> stop at toll booth -> continue driving`
  - remains `drive`

- `Bike -> wait at light -> continue biking`
  - remains `bike`

- `Drive -> park -> walk for several minutes`
  - may later switch to `walk`, but only after enough true moving-walk evidence appears

Implementation Direction
1. Add stationary classification helper in `auto-recording.service.ts`.
2. Split inference window into:
- moving samples
- stationary samples

3. Base candidate mode calculation on moving samples only.
4. If too few moving samples exist:
- preserve current mode
- do not force a new candidate

5. Keep existing segment duration validation from PLAN 31.

Validation
- Car trip with multiple red lights should stay `drive`.
- Car trip with toll booth stop should stay `drive`.
- Bike trip with traffic lights should stay `bike`.
- Real transition from `drive` to `walk` should still be detected after enough moving-walk evidence.

Out of Scope
- Full pause modeling inside auto mode
- Server changes
- Web changes
- Background-only special logic different from foreground
