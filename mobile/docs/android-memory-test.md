# Android memory navigation test

This local test repeatedly navigates through the existing `Test` trip, opens
waypoint photos in fullscreen, backgrounds the app and records Android memory
after each cycle. It runs against the installed encrypted local build and does
not clear application data.

## Prerequisites

- a connected Android device visible to `adb`;
- the E2E-enabled encrypted local build installed with
  `npm run android:local:encrypted:e2e --workspace mobile`;
- a local trip named `Test` whose first waypoint contains at least two photos;
- Maestro CLI installed (the runner also detects the standard local install at
  `/home/slavisa/.maestro/bin/maestro`);
- Java 17 or newer. On this development machine the runner automatically uses
  the installed OpenJDK 21.

## Run

From the repository root:

```bash
npm run android:local:encrypted:e2e --workspace mobile
npm run test:android:memory --workspace mobile
```

The E2E build displays a small `E2E` control on Trip Details. It gives Maestro
a stable way to open the first waypoint because native map markers are not
exposed in Android's accessibility hierarchy. Regular builds do not contain
this control.

Reports are written to `mobile/test-results/` and intentionally ignored by Git.
The default run performs three cycles with five fullscreen visits per cycle.

Configuration can be overridden without changing the flow:

```bash
TRAILBOOK_MEMORY_CYCLES=5 \
TRAILBOOK_MEMORY_TRIP_TITLE=Test \
TRAILBOOK_MEMORY_SETTLE_SECONDS=20 \
npm run test:android:memory --workspace mobile
```

The run fails if the app process restarts, background graphics exceeds 180 MB,
graphics grows by more than 80 MB from baseline, or background RSS exceeds
900 MB. These are conservative local regression guardrails, not substitutes for
Google Play's rolling production vitals.
