# PLAN 75: Android Closed Test Feedback

## Goal

Collect, reproduce and prioritize findings from the Google Play closed test before
changing the Android source or preparing the next App Bundle.

This is a living test document. A report belongs here before it becomes an
implementation task. Confirmed fixes may later be moved into focused plans.

## Current release boundary

- Closed-test release: `1.0.0`, version code `8`.
- The submitted AAB is immutable.
- Do not change or replace the release while its Google Play review is active.
- Local source changes and the next AAB are intentionally postponed until the
  reports below are triaged.
- Tester-only Premium access expires on August 22, 2026.

## Triage rules

Each report should move through these states:

```text
reported -> evidence collected -> reproduced -> root cause confirmed -> planned -> fixed -> verified
```

For every report, record when available:

- tester email and device model;
- Android version;
- app version and version code;
- exact time and time zone;
- whether the app was foregrounded, backgrounded, force-stopped or restarted;
- screenshot or exact error text;
- affected `client_trip_id`;
- relevant `raw_bundle`, API response and server/mobile logs;
- reproduction steps and frequency.

Do not infer a root cause from one symptom. In particular, distinguish:

- stale local state from incorrect backend state;
- OS termination from an application exception;
- an invalid Play tester configuration from an application bug;
- captured raw locations from processed segments and display-route output.

## Priority definitions

- **P0**: data loss, security issue or app unusable for most users.
- **P1**: startup failure, recording failure, incorrect Premium enforcement or
  another core workflow blocked.
- **P2**: degraded behavior with a workaround or incomplete diagnostics.
- **P3**: usability, copy or closed-test operational issue.

## Finding 1: Premium entitlement is stale locally

Status: **done; verified on Android local build (August 25, 2026)**
Priority: **P1**

### Symptom

A user with an active backend `premium_test` entitlement can be told:

> Your local test trip has been used. Premium is required to record another trip.

The access starts working after opening Premium options, which refreshes purchase
state.

### Evidence

- `svetozar.stojsin@gmail.com` had active `premium_test` access in PostgreSQL.
- The recording screen initially enforced the non-Premium local-trip limit.
- The same user later reported that it started working.
- Similar stale behavior was observed manually: entitlement refresh occurred
  when visiting Premium options.

### Working hypothesis

The recording gate reads cached local entitlement before a current `/purchases/me`
refresh. Premium options happens to trigger the missing refresh.

### Next-build investigation

- Identify every app lifecycle point that refreshes access.
- Capture cached and authoritative access values when recording is denied.
- Refresh access after authenticated startup, foreground/resume, restore and a
  successful purchase notification.
- Define offline behavior and cache validity explicitly.
- Do not make the mobile cache authoritative.

### Acceptance criteria

- Active backend Premium permits recording without opening Premium options.
- Expired or revoked access is removed within the defined refresh window.
- A temporary network failure does not incorrectly destroy a recently verified
  entitlement.

### Implemented fix

- Purchase access is hydrated and refreshed independently of the platform IAP
  provider after authenticated startup/login.
- Access is refreshed when the app returns to the foreground and every five
  minutes while it remains active.
- Starting a trip performs an authoritative access check before the local test
  trip allowance is consumed or rejected when the cached state is not Premium.
- A failed refresh retains the last verified cache. Offline Premium remains
  valid for seven days for monthly access and 30 days for yearly access, but
  never beyond a known subscription period end.
- Successful purchase verification and restore continue to update the cache
  immediately.

### Device verification

- Reviewer confirmed the entitlement and recording flow works correctly on the
  Android local build on August 25, 2026.

## Finding 2: Generic startup failure

Status: **done; verification pending on next Android build**  
Priority: **P1**

### Symptom

At least one tester received:

> Something went wrong  
> Trailbook could not finish starting. Check your connection and try again.

`Try again` had no visible effect in one observed case. On another phone the app
later started and retained the active recording, so these must not yet be treated
as the same failure.

### Missing evidence

- tester identity and exact device/Android version;
- timestamp;
- network state;
- failing startup phase;
- HTTP status/body, exception and retry attempt;
- whether secure auth, database initialization, migrations, purchase refresh or
  initial data loading failed.

### Next-build investigation

- Give startup phases stable diagnostic codes.
- Log the failed phase and sanitized reason locally.
- Make retry actually restart the failed initialization path.
- Separate connection errors, authentication errors, local database errors and
  unexpected exceptions in the UI.
- Add a safe diagnostics export suitable for a tester to send.

### Acceptance criteria

- A startup failure identifies a useful category without exposing secrets.
- Retry recovers after a transient failure.
- Logs identify the failed startup phase on a connected test device.

### Implemented fix

- Startup now runs through stable diagnostic phases for database preparation,
  authentication, preferences, background-task cleanup and recording recovery.
- The failure screen shows a safe diagnostic code, attempt number and UTC time;
  detailed exceptions remain in connected-device logs and are not persisted.
- Retry reruns the complete initialization sequence and increments the visible
  attempt number.
- The last safe startup diagnostic is stored locally without exception text,
  tokens, user identity, trip identity or captured locations.
- Active-recording recovery is idempotent: existing subscriptions and sampling
  timers are cleared before retry and also cleaned up after a failed location
  task restart.
- Recovery no longer materializes an unbounded trip route at startup. It counts
  all stored samples in SQLite but loads at most the latest 1,000 coordinates
  for the live map.

The confirmed Android persisted-location-job OOM remains Finding 3. These changes
make its startup/recovery symptom identifiable and retry-safe but do not claim to
fix Expo's large persisted job processing path.

## Finding 3: Long-running forgotten recordings and Android task continuity

Status: **done; Android stress verification pending**  
Priority: **P1**

### Symptom

Some testers start recording and leave it active overnight or for most of a day.
One reported trip contained only a late, inaccurate location callback after a
multi-hour recording. Other long recordings continued correctly after the phone
moved again.

### Evidence

- An affected bundle contained a recording interval of roughly five hours but
  only one location with approximately `300 m` accuracy.
- The location task was reported as already running when the app returned.
- A controlled long-recording test produced a different result and therefore
  did not reproduce the tester's failure.
- Another tester appears to have left recording active from one evening until
  the next day.
- The affected Xiaomi `2409BRN2CY` was inspected over USB on August 11, 2026.
- Android retained a Trailbook crash from August 9 at `08:42:50`:

  ```text
  FATAL EXCEPTION: main
  Process: com.slavisacicovic.trailbook
  java.lang.OutOfMemoryError
  growth limit 268435456
  expo.modules.location.taskConsumers.LocationTaskConsumer.didExecuteJob
  expo.modules.taskManager.TaskService.handleJob
  ```

- The crash occurred while Expo Location was unpacking a persisted background
  location job. The process had less than 1% of its 256 MB heap free.
- On inspection, precise location and activity recognition were granted, but
  notifications were denied, Trailbook was not on the device-idle whitelist,
  and its app standby bucket was `40` (`RARE`). These restrictions are relevant
  operating conditions, but they do not replace the confirmed immediate crash
  cause.

### Important distinction

An active trip record does not prove that Android is still delivering location
callbacks. We need to distinguish:

- UI/database recording state;
- registered Expo location task;
- Android foreground service state;
- actual callback cadence;
- accepted versus rejected location samples.

### Confirmed failure mechanism

For this device, the evidence no longer supports treating the incident as only
an Android sleep/task-kill problem. A long-running recording can leave Expo with
a large persisted location job or accumulated batch. Processing that job
exhausted the application heap and crashed the Trailbook process. The database
may still say that recording is active after the process dies, while no healthy
location callback pipeline remains.

The evidence proves the crash path, but does not yet prove which in-memory data
structure consumed most of the heap before the final small allocation failed.
A heap profile or deterministic large-batch reproduction is still required for
that narrower attribution.

### Next investigation

- Reproduce delivery of a large persisted/overlapping location batch while
  monitoring Java and native heap growth.
- Determine whether the dominant memory retention is in Expo job extras,
  duplicated raw batches, JS conversion, local persistence or live-route state.
- Process callbacks incrementally in bounded chunks rather than materializing an
  unbounded batch and all derived representations simultaneously.
- Put explicit upper bounds on callback/batch size and retained in-memory route
  data, while preserving every raw sample through safe incremental persistence.
- Make batch ingestion idempotent so overlapping/replayed Android batches do not
  multiply memory use or stored samples.
- Detect process restart with a locally active recording and explicitly rebuild
  or restart the tracking pipeline instead of trusting the stale recording flag.
- Compare raw callback timestamps with recording lifecycle events.
- Add a recording health/watchdog state based on last callback time.
- Decide separately whether the product should warn about or automatically
  pause obviously forgotten recordings.

### Acceptance criteria

- Returning to an active recording clearly reports whether location capture is
  healthy, delayed or stopped.
- Diagnostics can show the last callback and last accepted location.
- Movement after a long stationary period resumes capture or produces a clear,
  actionable recovery state.
- A stress test with a large persisted location job stays within a defined memory
  ceiling and does not crash near the Android 256 MB heap limit.
- After a forced process death during recording, reopening Trailbook either
  resumes a verified foreground location task or clearly asks the user to recover;
  it never silently presents stale `recording active` state as healthy capture.

### Implemented fix

- Android recording no longer uses Expo TaskManager as its primary location
  transport. Expo merged unprocessed locations into one persisted `JobInfo`, then
  materialized the complete merged list before the JS callback, which is the
  confirmed pre-JS OOM path on the affected Xiaomi.
- A Trailbook native Android foreground service now requests fused locations by
  `PendingIntent`. Its receiver immediately appends locations to a disk-backed
  JSONL queue instead of scheduling an accumulating Expo job.
- JS peeks at most 250 queued locations at a time, persists the chunk, and only
  then acknowledges it. A process death before acknowledgement replays the chunk
  instead of losing it.
- SQLite migration 11 removes pre-existing exact duplicates and adds identity
  indexes for raw location and activity samples. All new inserts use conflict
  ignore, making native queue replay idempotent.
- Native receipt sorts each delivered list by timestamp and suppresses recently
  repeated exact samples before queueing. Persisted raw samples remain intact;
  only exact duplicate identities are ignored.
- Active-trip startup always rebuilds the native foreground capture pipeline and
  records a `SERVICE_RESTARTED` event. Failed rebuilds surface as the dedicated
  `STARTUP-RECORDING-01` failure from Finding 2.
- Recording state now distinguishes `starting`, `healthy`, `delayed`, `stopped`
  and `paused`. The screen shows the last accepted location and offers an explicit
  **Restart capture** action for delayed/stopped capture.
- Live route memory remains bounded to the latest 1,000 display coordinates while
  SQLite retains and counts the complete raw capture.

### Verification still required

- Run an instrumented Android stress recording with thousands of queued samples,
  forced process death and replay while observing Java/native heap.
- Verify the foreground service and PendingIntent delivery on Xiaomi/HyperOS,
  Samsung and stock Android with the screen locked and app in a restricted bucket.
- Confirm that denying notification permission still leaves an Android-compliant
  foreground-service state on every supported API level.
- Confirm queue replay after killing the process between SQLite commit and native
  acknowledgement, with no duplicate raw locations or activities.

## Finding 4: Activity-based trip segmentation needs real-bundle verification

Status: **done; verified against copied original raw bundle and Android local build**
Priority: **P2**

### Symptom

Bike trips can be incorrectly split into `BIKE + DRIVE` when speed alone is
ambiguous. Android raw bundles may contain useful activity recognition values,
for example `ON_BICYCLE`, that must influence processing.

### Product rule to verify

A direct `BIKE <-> DRIVE` transition should not be accepted unless a sufficiently
long stationary interval separates the modes. The working threshold discussed
during testing is approximately 20 seconds, but it must be validated against
real captures. This rule must apply only after both modes have been reliably
established. It must not lock an initial false-positive activity classification.

### Confirmed ambiguity: fast bicycle versus false-positive bicycle

The tester confirmed that `Razvoz robe` was entirely a car journey: the driver
left home, stopped at several locations to unload goods, and then continued
driving. There was no bicycle-to-car transition.

One processed `BIKE` segment nevertheless contains:

- 32 `ON_BICYCLE` samples with confidence `60`;
- 39 `IN_VEHICLE` samples with confidence `70`;
- one `STILL` sample with confidence `90`;
- approximately `29.4 km/h` average segment speed;
- reported speeds up to approximately `49.5 km/h` with roughly `3 m` location
  accuracy.

The speed is therefore not explained by a GPS jump. Android Activity Recognition
initially produced a plausible but incorrect `ON_BICYCLE` hypothesis and later
produced a longer `IN_VEHICLE` run. The current transition rule retained the
initial `BIKE` mode because no 20-second stop separated it from `DRIVE`, even
though the real mode never changed.

Activity Recognition must be treated as probabilistic evidence rather than an
authoritative mode. Android derives it from short bursts of low-power device
sensor data; a confidence value expresses consistency with a learned activity
pattern, not proof of the transport mode. Vehicle vibration, a rough road,
phone placement, and stop-and-go urban driving can resemble bicycle motion.

### Processing approach to evaluate

- Treat an early `ON_BICYCLE` result as provisional until supported by a longer
  observation window.
- Combine activity history, confidence, reported/derived speed, accuracy,
  continuity and later observations; do not decide from one speed threshold.
- Preserve a genuinely fast bicycle when `ON_BICYCLE` remains dominant and
  temporally continuous, even at speeds around 40-50 km/h.
- Retroactively change provisional `BIKE` to `DRIVE` when a sufficiently long,
  stronger and continuous `IN_VEHICLE` sequence shows that the initial bicycle
  classification was a false positive.
- Treat delivery stops as `DRIVE -> STILL -> DRIVE`, not automatically as a
  transport-mode change.
- Require the stationary boundary for a confirmed real `BIKE <-> DRIVE`
  transition, but never use it to preserve an unconfirmed initial mode.
- Evaluate the symmetric false-positive case where an initial provisional
  `DRIVE` may later need to become `BIKE`.

### Acceptance scenarios

- Replay `Razvoz robe` as a regression fixture and classify the complete moving
  journey as `DRIVE`, retaining stops according to the chosen stationary policy.
- Replay a real fast-bicycle fixture and keep it `BIKE` despite short intervals
  above the ordinary speed-only bicycle threshold.
- Preserve a genuine `BIKE -> stationary >= 20 s -> DRIVE` transition as two
  distinct transport modes.
- Do not allow a short, isolated Activity Recognition false positive to split or
  relabel an otherwise consistently classified journey.

### Implemented fix

- Processing version `15` treats `BIKE` and `DRIVE` labels as provisional across
  one uninterrupted movement run.
- Activity confidence is accumulated across the run. A stronger later signal can
  retroactively correct an initial false positive instead of being interpreted as
  a real transport-mode transition.
- A retained stationary interval ends the movement run. Therefore a real
  `BIKE -> stationary >= 20 s -> DRIVE` transition is still preserved as three
  distinct intervals.
- Implausible bicycle speed remains strong `DRIVE` evidence. Ordinary high bicycle
  speed is not used as decisive vehicle evidence when continuous `ON_BICYCLE`
  samples support cycling.
- Regression coverage reproduces the documented `Razvoz robe` evidence balance:
  `32 x ON_BICYCLE@60` followed by `39 x IN_VEHICLE@70` at approximately
  `29.4 km/h`. It resolves to one `DRIVE` run.
- Separate regressions preserve a consistently motion-confirmed bicycle at
  `45 km/h` and a genuine bicycle-to-vehicle change after a 20-second stop.
- After `DRIVE` is established, an alternative `BIKE` or `WALK` mode must be
  both confidence-dominant and sustained for that mode's minimum duration.
  Short or contradictory Activity Recognition bursts therefore cannot split a
  confirmed vehicle journey.
- A confirmed dwell adjacent to `DRIVE` remains stationary when GPS jitter or
  small unloading movements produce a walking-sized accumulated path. This
  prevents delivery stops from being relabelled as `WALK`.

### Real-bundle verification

The supplied `[TEST COPY] Razvoz robe` trip was created on the reviewer's phone
by restoring the original trip's `raw_bundle`. Its copied trip identity and
owner therefore do not affect processing verification.

The version `15` pipeline replayed all `1,014` raw locations and `1,014` activity
samples. The activity stream contained `292 IN_VEHICLE@70`,
`301 ON_BICYCLE@60`, `145 ON_FOOT@75` and `276 STILL@90` best-confidence
samples. The final output contains only `DRIVE` and retained `STATIONARY`
segments; it contains no `BIKE` or `WALK` segment. This matches the tester's
description of an entirely car-based delivery route with unloading stops.

The raw bundle is intentionally not stored in this repository because it
contains private trip and location data. Sanitized unit regressions retain the
classifier evidence patterns and delivery-dwell behavior found by the replay.

### Diagnostic workflow established

To inspect a tester trip without changing the original:

1. create a new trip row owned by the reviewer;
2. copy its raw capture bundle;
3. assign a new `clientTripId` and rewrite embedded references;
4. remove images/waypoints when they are irrelevant;
5. clear segments and set processing version to `0`;
6. restore local data on the reviewer phone;
7. run local reprocessing with the current pipeline.

Current diagnostic clone:

```text
Source: 76e844f1-79d4-4b83-a7ce-448af51bebfd (Razvoz robe)
Owner:  ovthemija@gmail.com
Clone:  24cbb86d-8bf0-42d8-8eaf-0fe8c9172db1
Title:  [TEST COPY] Razvoz robe
```

### Future tooling candidate

Add a read-only admin trip inspector that can show:

- raw location path;
- processed segments and their modes;
- callback gaps and point accuracy;
- activity recognition samples;
- processing version;
- reprocessing preview without modifying the production trip.

This would replace manual PostgreSQL JSON cloning for routine triage.

### Device verification

- Reviewer confirmed the activity-based segmentation result on the Android
  local build on August 25, 2026.

## Finding 5: Temporary tester Premium lifecycle

Status: **done; temporary grant removal verified on Android local build**
Priority: **P2**

### Current behavior

Closed-test users were given time-limited `premium_test` access so they did not
need to make real Google Play purchases. This is backend test access rather than
a Google Play lifetime product.

### Implemented removal

- The `POST /admin/tester-premium` endpoint, backend grant implementation and
  admin-dashboard controls were removed, so no new temporary grants can be
  created through the application.
- Existing `premium_test` rows are treated as retired regardless of their former
  expiry date. On the next entitlement read, the backend empties their
  entitlements, marks them `expired`, records `revokedAt` and returns demo access.
- The row is retained as audit evidence instead of being deleted. Its former
  grant, expiry and update history therefore remain inspectable.
- Revocation is selected only by the exact `premium_test` plan code. Apple and
  Google provider-backed purchases continue through their existing verification
  and entitlement paths unchanged.
- No replacement beta-grant mechanism is retained. A future beta program must
  introduce an explicit, audited workflow as a separate product decision.

### Device verification

- Reviewer confirmed the expected non-temporary entitlement behavior on the
  Android local build on August 25, 2026.

## Finding 6: Current-trip route is corrupted while a large location batch is processed

Status: **done; stationary-drift regression verified, original large-batch stress verification pending**
Priority: **P1**

### Symptom

While recording is active, opening the current trip can temporarily render a
dense, self-crossing route with long lines between unrelated points. The
reported case occurred around the time Android delivered a large accumulated
location batch and the app appeared to still be processing it.

The screenshot from August 11, 2026 shows the route repeatedly jumping across
the same area instead of following the travelled path.

After recording is stopped, the displayed route becomes correct. It has not yet
been verified whether merely leaving and reopening the current-trip screen,
without stopping the recording, also corrects it.

This makes corruption of the persisted raw capture less likely and points more
strongly toward incremental active-route derivation, temporary UI state or
non-atomic publication of the in-progress geometry. This remains a working
hypothesis until the affected bundle and screen lifecycle are inspected.

### Do not assume yet

The screenshot does not by itself prove that the stored raw locations are
corrupt. Possible layers include:

- locations within a batch being consumed or displayed out of timestamp order;
- the same batch or points being appended more than once;
- the map reading a route array while it is being rebuilt or replaced;
- temporary mixing of raw points, accepted points and processed segment points;
- stale current-trip state being merged with a newly received batch;
- an invalid or low-accuracy location connecting otherwise valid route parts.

### Evidence needed from the next occurrence

- `client_trip_id`, device model and exact timestamp;
- raw batch sizes and callback timestamps;
- count and timestamp range before and after each batch merge;
- whether timestamps are monotonic and whether point IDs/coordinates repeat;
- raw, accepted and displayed point counts;
- whether leaving and reopening the screen corrects the route;
- confirmation that the final saved/restored trip remains correct after
  stopping (the observed final route corrected itself);
- the affected `raw_bundle` and local diagnostics.

### Next-build investigation

- Make batch ingestion idempotent and order locations by timestamp before route
  derivation.
- Publish a complete route snapshot to the UI only after a batch transaction is
  finished; do not expose an array while it is being mutated.
- Keep raw capture, accepted recording points and processed display geometry as
  distinct data sets.
- Add diagnostic counters for received, duplicate, rejected, accepted and
  displayed points per batch.
- Stress-test the current-trip screen by injecting delayed batches containing
  many points, duplicates and out-of-order timestamps.

### Acceptance criteria

- Opening the current trip during a large batch never shows connections between
  unrelated or partially processed points.
- Replaying the same batch is idempotent and does not add duplicate geometry.
- The displayed route uses a timestamp-ordered, immutable snapshot.
- A test with delayed and out-of-order callbacks produces the same final route
  as chronologically delivered callbacks.
- The live route and final stopped route use compatible filtering and ordering
  rules, so stopping is not required merely to obtain valid geometry.

### Confirmed implementation cause

The recording screen previously mapped recent raw database rows directly to the
polyline. The stopped-trip route instead used `buildDisplayRoutePoints`, which
sorts samples, rejects inaccurate points and impossible speed spikes, removes
duplicate timestamps and thins the display geometry. This pipeline mismatch
explains why stopping could make the same persisted capture appear correct.

Concurrent `rawData:changed` refreshes could also complete out of order. An older
query result was able to overwrite a newer route snapshot even though each
individual database query was valid.

### Implemented fix

- The live route now uses the same immutable display-route builder as the final
  trip instead of exposing raw coordinates directly.
- Equal-timestamp samples use a deterministic accuracy/coordinate/provider
  ordering, so delayed and out-of-order callback delivery produces the same
  route as chronological delivery.
- Exact persisted duplicates remain prevented by the unique raw-sample identity
  migration added with Finding 3. Display building also safely collapses
  duplicate timestamps already present in an input snapshot.
- Every asynchronous live refresh receives a generation number. Only the newest
  generation for the still-active trip may publish state; late stale results are
  discarded.
- Snapshot diagnostics report received, duplicate, rejected, accepted, displayed
  and total persisted point counts without logging coordinates.
- Regression coverage injects delayed order, an exact duplicate and an
  inaccurate unrelated point, and verifies byte-for-byte equivalent ordered
  display points to the chronological route.

The original screenshot bundle was not required to identify this deterministic
pipeline mismatch. If a future occurrence survives this fix, the existing
callback and snapshot counters should distinguish persisted input corruption
from display derivation without exposing location data.

### Verification clarification

- The August 25 Android test and supplied `Long recording test` bundle verified
  processing version 17: `STATIONARY` segments contribute zero distance and
  their GPS samples are excluded from the displayed polyline. The replay fell
  from 2.64 km in the original processing to 338.3 m without deleting raw data.
- This resolves the dense stationary GPS-drift route observed in that test.
  It is related to the visual symptom tracked here, but it is not a reproduction
  of the original in-flight large-batch/non-atomic publication mechanism.
- A deliberately delayed large Android batch while the current-trip screen is
  open remains the required stress verification for that original mechanism.

## Finding 7: Recording completes with duration but zero distance

Status: **done; rejected-fix health warning implemented**
Priority: **P1**

### Symptom

A tester produced a trip lasting approximately 26 minutes while the displayed
distance remained `0 km`. Location permissions were checked with the tester and
appeared correct. Android battery usage for Trailbook was set to `Optimized`,
not `Unrestricted`.

The tester changed the setting to `Unrestricted`; subsequent recordings will be
observed. This change is diagnostic evidence, not yet proof that battery
optimization caused the missing distance.

### Raw-bundle analysis

Affected trip:

```text
clientTripId:      2d95cfd5-dbd7-4c19-baa1-21e3decc8169
title:             Home
device:            SM-A566B
Android API:       36
recording:         2026-08-10 14:35:24Z - 15:02:01Z
processingVersion: 14
```

The location task started successfully and produced `22` callback events with
`36` raw locations. Therefore this is not a case with no Android callbacks.

Every raw location failed the current accuracy requirement:

```text
processing maxAccuracyM: 25 m
best raw accuracy:       81.1 m
worst raw accuracy:      200 m
locations <= 25 m:       0 / 36
```

`cleanLocations()` consequently removed all points during its first accuracy
filter stage. Empty segments and `0 km` are consistent with the current
processor rules.

Battery state snapshots reported GPS enabled, 35% battery and power-save mode
off. Battery optimization may still have contributed to batching: after early
single-location callbacks, one callback delivered 15 accumulated locations at
about `15:01Z`, covering timestamps from approximately `14:39Z` to `15:01Z`.
It does not explain the zero distance by itself, because even the early frequent
callbacks had only `100-200 m` accuracy and would also have been rejected.

The tester's Android location settings were checked and `Use precise location`
was enabled. Approximate-only permission is therefore excluded as the cause of
the `81-200 m` fixes in this occurrence.

Activity recognition reported movement during the first minutes, including
`ON_BICYCLE` and intermittent `IN_VEHICLE`, but activity classification cannot
substitute for an accurate route geometry.

### Evidence needed

- manufacturer-specific location services, including Google Location Accuracy;
- whether the phone had clear sky visibility or was carried where GNSS reception
  was obstructed;
- foreground-service notification visibility;
- whether the phone moved continuously and whether the screen was locked;
- a comparable recording after changing to `Unrestricted`.

### Product behavior to decide

- Trailbook should remain functional under normal `Optimized` battery settings
  when an explicit foreground recording service is healthy.
- The app may detect battery-optimization state and explain how to change it
  when the device demonstrates unreliable background capture.
- Do not make a blanket direct exemption request at every recording start.
  Such a request is intrusive and Google Play permits direct exemption only for
  qualifying core use cases.
- If guidance is added, show it contextually before or after evidence of an
  unhealthy recording, with a clear user choice and manufacturer-independent
  fallback instructions.

### Acceptance criteria

- Starting a recording confirms that the location task and foreground service
  are actually active.
- A recording with no acceptable location callback for a defined interval shows
  a visible warning rather than silently producing `0 km`.
- Diagnostics distinguish no callbacks from callbacks rejected for accuracy or
  filtering.
- Normal optimized-battery operation is covered by a locked-screen test on
  representative devices.

### Implemented fix

- Capture health now tracks the first and latest raw callback separately from
  the latest point accepted by the same route builder used for display and final
  processing.
- If raw locations span at least two minutes but none is acceptable, health
  becomes `inaccurate` instead of incorrectly becoming `healthy`. If acceptable
  fixes existed and raw callbacks later continue for five minutes without a new
  acceptable fix, health also becomes `inaccurate`.
- Missing or stale callbacks remain distinct `starting`, `delayed` and `stopped`
  states. The warning therefore distinguishes capture-service failure from the
  observed case where callbacks arrived but all geometry was filtered.
- The recording screen shows a visible explanation that fixes are arriving but
  GPS accuracy cannot build a route, with guidance to move to open sky and check
  precise-location settings. Invalid `81-200 m` fixes are not converted into a
  fabricated distance.
- Live snapshot diagnostics from Finding 6 expose received, rejected, accepted
  and displayed counts without coordinates, while callback events retain batch
  counts. Together they distinguish no callbacks from filtered callbacks.
- Regression tests cover no callbacks, sustained rejected fixes, stale callback
  delivery and continuing acceptable fixes.

Foreground/native capture startup is awaited before recording start completes,
as hardened in Findings 2 and 3. Locked-screen validation on representative
physical devices remains a release verification activity rather than a unit-test
condition.

## Finding 8: Completed walking route contains long straight jumps and zigzags

Status: **done; uncertain route gaps are no longer connected**
Priority: **P1**

### Symptom

The shared completed trip `Test` displays an implausible zigzag route near
Strand in Novi Sad, although its final distance is only `342 m`.

Affected trip:

```text
clientTripId:      877f170c-b0a0-4e85-a475-89bf69e766df
recording:         2026-08-11 05:25:31Z - 06:03:21Z
processingVersion: 14
raw locations:     518 entries / 239 unique timestamps
processed result:  2 WALK segments / 342.34 m
```

### Raw-bundle analysis

This is different from the zero-distance case. The device sometimes produced
excellent fixes (`3.65 m` best accuracy), but accuracy varied heavily up to
`343.72 m`. Only `68 / 239` unique samples met the current `25 m` accuracy
threshold.

The accepted samples are separated by large holes. Examples include:

- `345 m` between accepted samples separated by `223 s`;
- `200 m` over `139 s`;
- `524 m` over `327 s`;
- `889 m` over `950 s` near the end of the recording.

Connecting sparse accepted samples with straight lines can therefore draw a
route across unrelated streets or buildings even when each endpoint reports
accuracy just under the cutoff. A binary `25 m` cutoff is not sufficient to
guarantee plausible geometry.

The callback stream also contains an independent batching/idempotency problem.
After callbacks with one location at a time, Android delivered overlapping
batches of `139`, `140` and `141` locations with the same first timestamp. The
raw bundle consequently contains `518` location entries but only `239` unique
timestamps: `279` entries are duplicates. This is consistent with the separate
live-map corruption report and must be handled idempotently even if final
processing later deduplicates some data.

Only two walking segments were retained:

```text
05:25:31Z - 05:26:57Z   100.91 m
05:35:32Z - 05:37:41Z   241.43 m
```

Later raw locations exist, but are not represented in the final segments. The
processor's segmentation and termination decisions must therefore be inspected
alongside accuracy filtering; the screenshot cannot be explained by a single
bad point alone.

### Next-build investigation

- Deduplicate raw locations using a stable sample identity/timestamp before
  appending, processing or displaying a callback batch.
- Treat overlapping batches as replays and make ingestion idempotent.
- Add a maximum acceptable gap/distance policy before drawing a continuous
  polyline between accepted points; split route geometry across uncertain gaps.
- Evaluate plausibility using accuracy, elapsed time, distance, reported speed
  and neighboring fixes rather than only a binary accuracy threshold.
- Record rejection and segment-break reasons in diagnostics.
- Replay this exact sanitized bundle as a regression fixture and compare raw,
  cleaned, segmented and rendered geometry.

### Acceptance criteria

- Overlapping `139/140/141`-point callbacks do not duplicate stored or displayed
  locations.
- Sparse accepted fixes are not connected across long uncertain gaps.
- The completed route does not cross unrelated blocks merely because two
  endpoints individually pass the `25 m` threshold.
- The UI can distinguish a continuous recorded route from missing/uncertain
  route sections without inventing geometry.

### Implemented fix

- Processing version `16` treats every gap longer than 60 seconds as uncertain
  and never connects its endpoints, even when they happen to be less than the
  former 100 m fallback distance apart.
- Within a continuous time window, connection plausibility is mode-aware:
  `WALK`, `BIKE`, `STATIONARY`, vehicle, boat and plane segments use separate
  maximum implied speeds. A walking GPS zigzag can therefore be rejected without
  applying walking limits to a valid vehicle route.
- Segment distance uses the same connection decision as rendered geometry.
  Distances across hidden gaps are not silently included in trip totals.
- Trip detail, waypoint mini-maps and photo route previews render separate
  polyline groups. Auxiliary views cannot reconnect an uncertain temporal gap;
  the segment-aware trip view additionally applies mode plausibility.
- The stable raw-sample identity migration from Finding 3 makes overlapping
  callback replays idempotent before processing and display.
- Regressions cover a gap just over 60 seconds with nearby endpoints, an
  implausible 30-second walking jump to another block, the corresponding valid
  vehicle connection and ordinary continuous walking.

The private affected raw bundle is not stored as a repository fixture. The
regression encodes the measured temporal/distance failure mode without retaining
tester coordinates.

## Finding 9: Stop can process an incomplete in-flight Android location batch

Status: **done; stop now drains and verifies final raw snapshot**
Priority: **P1**

### Symptom

Two simultaneous walks, `Andr setnja` and `Ios setnja`, should have produced
equivalent routes. The Android route stopped at approximately `21:06`, although
recording continued until approximately `21:17`. Manually running Reprocess on
the Android trip restored the complete route.

Affected Android trip:

```text
clientTripId:      454eda78-1d30-4317-88c4-a359b83f38b4
title:             Andr setnja
recording:         2026-08-11 20:41:34 - 21:17:50 Europe/Belgrade
processingVersion: 14
raw locations:     280
```

Comparison trip:

```text
clientTripId:      4e237be7-4c70-4603-b3a6-b0538d9e8c89
title:             Ios setnja
recording:         2026-08-11 20:40:47 - 21:17:29 Europe/Belgrade
raw locations:     361
```

### Evidence

- Android raw locations continue through `21:17:13`; the missing interval was
  captured and was not lost by the Android location task.
- The Android samples after `21:06` are predominantly `11-14 m` accuracy and
  their activity samples report `ON_FOOT` with confidence `75`.
- The persisted Android WALK segment ends at `21:06:43`, exactly matching the
  visible route cutoff. The iOS WALK segment continues until approximately
  `21:16`.
- At `21:17:48`, Android delivered one callback containing `150` locations with
  timestamps spanning approximately `20:58:22-21:17:13`.
- Stop began about two seconds later, at approximately `21:17:50`.
- The location callback currently records its received event first and then
  awaits individual location and activity inserts in a sequential loop.
- `stopLocationTask()` stops future updates but does not wait for an already
  executing callback to finish its database writes.
- `stopRecording()` immediately reads the raw bundle and replaces processed
  segments after stopping capture. It can therefore observe only the prefix of
  an in-flight batch.
- The remainder of the batch is subsequently persisted, leaving complete raw
  data but stale, truncated processed segments.
- Manual Reprocess later reads all `280` locations and produces the complete
  route. This confirms that the failure is processing timing rather than GPS
  loss, accuracy filtering or activity classification.

### Confirmed failure mechanism

There is no synchronization boundary between an active Android location-task
callback and final trip processing. Stopping the native task prevents future
delivery, but it does not guarantee that the JavaScript callback already in
progress has completed its local writes. Final processing can race that write
and permanently save segments derived from a partial snapshot.

### Next-build implementation plan

- Track active location callback writes with a shared promise, counter or mutex.
- On Stop, prevent new ingestion and await all callbacks that were already
  accepted before reading the raw bundle.
- Persist each callback batch atomically where practical, using bounded bulk
  inserts rather than one location and one activity insert at a time.
- Keep ingestion idempotent because Android may replay overlapping batches.
- Capture the final raw count and last raw timestamp immediately before
  processing and include them in diagnostics.
- Consider a post-processing consistency check: if raw data advances beyond the
  processed segment boundary during finalization, rerun processing before the
  trip is considered complete.
- Preserve manual Reprocess as a recovery path, but do not rely on users to
  discover and repair truncated trips.

### Acceptance criteria

- Stopping during an injected large Android callback waits for that callback's
  accepted samples to finish persisting.
- Initial processing and later manual reprocessing produce identical segment
  boundaries and route geometry.
- The final processed boundary reaches the final usable raw location without
  requiring the screen to be reopened or Reprocess to be invoked.
- Replayed or overlapping final batches do not create duplicate raw samples or
  geometry.
- A regression test reproduces the observed ordering: a `150`-location callback
  begins, Stop occurs during insertion, and the resulting route remains complete.

### Implemented fix

- Native queue draining now uses a shared single-flight promise instead of a
  boolean early return. Stop joins an already active drain rather than treating
  `drain in progress` as `nothing to wait for`.
- Android native stop clears future delivery and then crosses the same storage
  lock used by the BroadcastReceiver append path. When native stop returns, any
  receiver that had already accepted a batch has completed its queue write.
- JavaScript performs two post-stop drain calls: the first joins an in-flight
  persistence operation, and the second drains the queue after native production
  is stable. Location and activity samples continue to use bounded bulk inserts
  and idempotent raw-sample identities.
- The Expo TaskManager fallback has its own active-write barrier. Its former
  per-location sequential loop is replaced by bulk location/activity inserts,
  and `stopLocationTask()` waits for every callback write already in progress.
- `RECORDING_STOPPED` diagnostics include the final raw location count and final
  raw timestamp immediately before bundle processing.
- Finalization compares that snapshot with the raw database after processing.
  If raw data advanced, it reloads the bundle and reruns processing, up to three
  stable-snapshot attempts; it refuses to publish known-stale segments if the
  capture cannot stabilize.
- The race regression blocks an in-flight 150-location drain after 25 samples,
  invokes the Stop-side drain, verifies that both calls share one operation, and
  confirms all 150 samples are present before Stop continues. It also verifies
  that a fresh post-stop drain pass can run afterward.
- A separate fallback regression verifies that TaskManager stop waits across a
  blocked callback write instead of returning with a partial batch.

The native location module Kotlin source compiles successfully. The wider app
Gradle task proceeded through `trailbook-native-location:compileDebugKotlin` and
then stopped at the repository's absent generated
`android/app/src/main/AndroidManifest.xml`; this is an Expo prebuild workspace
condition, not a Kotlin error in the change.

## Finding 10: Shared-trip photos load slowly or never in Trip Details and the fullscreen viewer

Status: **completed; verified on Android local build (August 25, 2026)**
Priority: **P2**

### Symptom

On a shared trip (in-app share), Trip Details shows the route map. Tapping a
waypoint marker opens the waypoint photo preview, and its thumbnail takes a
noticeable time to appear. Tapping the thumbnail opens the fullscreen photo
viewer, but loading can last indefinitely with a black background and no error.

The owner's own trips are not affected: there the preview and fullscreen viewer
render from local files immediately. This points at the shared-trip image path,
not at the screens themselves.

### Evidence

Affected flow on mobile (in-app shared trip):

- `tripDetailStore.loadShared()` builds each waypoint image as
  `{ ..., localUri: image.getUrl, uploadState: 'UPLOADED' }`. The pre-signed S3
  GET URL is therefore used directly as the React Native `<Image>` source
  (`WaypointPhotoPreview` thumbnail and `WaypointPhotoViewer`/`ZoomablePhoto`
  fullscreen).
- React Native renders that remote URL every time the screen is opened; there is
  no download-to-file and no cache for shared-trip images. The restore path
  (`RestoreTripsUseCase` + `saveRestoredPhoto`) exists for restored trips but is
  not used for shared-trip viewing.

Server-side causes of latency and failure:

- `waypoint-images.service.ts` `getImages()` issued a serial `HeadObject` call
  to S3 for every image (a `for` loop, not parallel) and signs a GET URL with
  `expiresIn: 60 * 60` on every request. The shared-trip access endpoints
  (`/shared/trips/:token/access`, `/trips/shared-with-me/:clientTripId`, and
  the shared-with-me list) all call this per waypoint. Response time therefore
  grew linearly with photo count, and the returned URL expires after one hour.
  The serial object-store validation has now been removed as documented below.
- There is no thumbnail/resize mechanism anywhere in the stack. Originals
  (previously JPEG/PNG/HEIC/HEIF/WebP, up to the 10 MB upload limit) were served as-is to
  both the thumbnail preview and the fullscreen viewer.

Failure presentation:

- `ZoomablePhoto` (and the InfoWindow images on the web shared page) has no
  `onLoad`/`onError` handling. A 403 from an expired pre-signed URL or a slow
  download leaves a black background indefinitely; the app never reports the
  failure and never refreshes the URL.

Web link share:

- `shared-trip-map.tsx` `renderWaypointInfo()` embeds up to four full-resolution
  `<img src={getUrl}>` elements per InfoWindow. Same lack of thumbnails, and no
  click handler exists to open a fullscreen view on the web.

### Important distinction

- Slow thumbnails and a stuck fullscreen viewer are separate symptoms: one is
  bandwidth/decoding of full-size originals, the other can be an expired
  pre-signed URL combined with missing client error state.
- Own trips vs. shared trips use different image sources; fixes for shared trips
  must not change local-file rendering.
- In-app shared viewing (mobile) and web link sharing (social networks) share
  the same server-side URL generation, so a server fix helps both, while client
  caching is mobile-only.

### Direction

Thumbnail generation is intentionally dropped from the current design.

For the in-app shared-trip flow, a user who opens a waypoint photo is expected
to continue to the full image in nearly every case. Downloading a thumbnail and
then the original would add a second object, upload/retry path, API field, cache
lifecycle and extra transfer without removing the need for the original.

The selected mobile model is therefore:

1. keep one original object in S3/MinIO;
2. download that original once to a persistent shared-image cache on the device;
3. deduplicate concurrent requests for the same image;
4. use the same local file URI for waypoint preview and fullscreen;
5. reuse the local file on later opens and expose retry/error state when the
   initial download fails.

If device measurements later show unacceptable local decode/memory cost for
large originals, thumbnails can be reconsidered from evidence. They are not a
prerequisite for fixing the current repeated-network and expired-URL failures.

Web link sharing currently has no fullscreen photo view. A web lightbox/fullscreen
viewer will be implemented when that flow is developed. Web-specific thumbnails
may be reconsidered then because a web visitor can inspect the map without ever
opening all originals; they are not part of the current Finding 10 implementation.

### Implemented server improvement

- `completeUpload()` remains the single remote-object verification boundary: it
  performs `HeadObject`, validates content type and size, and only then records
  `uploadStatus = uploaded` and `remoteVerifiedAt`.
- `getImages()` now trusts that verified database state and signs all GET URLs
  without repeating `HeadObject` for every image. Shared-trip response latency
  therefore no longer contains one serial S3 round-trip per photo.
- A transient S3 read/list failure can no longer cause `getImages()` to delete
  otherwise valid image metadata.
- Regression coverage lists three uploaded images and verifies that listing
  performs zero object-store requests while returning a signed URL for each.

### Implemented mobile improvement

- Shared-trip originals are downloaded into the app document directory and the
  resulting local URI is used by both the waypoint preview and fullscreen
  viewer. A non-empty cached file is reused on every later open.
- Downloads for different images run concurrently, while a `SingleFlight`
  coordinator deduplicates concurrent requests for the same image.
- Each download has a 20-second deadline, uses a temporary file and moves it
  into place only after a successful non-empty response. Failed/partial files
  are removed and do not poison the persistent cache.
- If any download fails, `loadShared()` refreshes the shared-trip detail once to
  obtain new signed URLs and retries only the failed images. This covers URLs
  that expired while the app was backgrounded without redownloading successful
  images.
- Waypoint preview and fullscreen photo components now expose explicit loading,
  failure and retry states instead of an indefinite blank/black image.
- Regression tests cover concurrent download deduplication and verify that a
  failed operation is removed so a later retry can run.

### Device verification

- Instrument shared-trip image timing on the device: request start, bytes
  received, decode, first frame, for both the waypoint preview and fullscreen
  viewer; record HTTP status on failure.
- Confirm first-open timing and local decode/memory behavior with the largest
  allowed originals on the Android and iOS closed-test devices.
- Confirm airplane-mode reopening after one successful load and recovery after
  deliberately expiring a signed URL.
- Web: add a fullscreen/lightbox photo view with loading and error states as a
  later web-link-share enhancement.

### Acceptance criteria

- Tapping a waypoint marker shows the locally cached original promptly after its
  first download.
- The fullscreen viewer shows the photo or a clear error within a defined time;
  an expired pre-signed URL is refreshed automatically.
- Opening a shared trip twice does not re-download images that are already
  cached locally.
- Shared-trip access does not perform serial object-store validation per photo.
- Web fullscreen behavior is tracked as a later enhancement and does not block
  the mobile shared-image cache fix.

### Device verification result

- Reviewer confirmed that shared-trip waypoint images and the fullscreen viewer
  work correctly on the Android local build on August 25, 2026.

## Finding 11: HEIC/HEIF uploads can render as broken images on the web

Status: **completed; verified on Android local build (August 25, 2026)**
Priority: **P2**

### Symptom

A shared trip photo stored as `image/heic` or `image/heif` cannot be rendered
by Chrome, Edge or Firefox. The web shared-trip page (`shared-trip-map.tsx`
InfoWindow `<img>` and any future lightbox) would show a broken or missing
image for such a photo, while Safari renders it.

### Evidence

- The server explicitly allows these types:
  `MEDIA_UPLOAD_ALLOWED_CONTENT_TYPES` includes `image/heic` and `image/heif`
  (`waypoint-images.service.ts`).
- The mobile uploader derives the content type from the local file extension
  (`UploadWaypointImagesUseCase.getContentType`: `.heic` -> `image/heic`,
  `.heif` -> `image/heif`), and `addPhotoToWaypoint` preserves the picked
  asset's original extension.
- Previous picker calls passed `quality: 0.8/0.85`
  (`RecordingScreen`, `AddWaypointSheet`, `WaypointDetailScreen`), which on iOS
  re-encodes to JPEG. The defect is therefore latent today, but both the mobile
  path and the server accept HEIC/HEIF, so any future "original quality" pick
  or direct upload can persist an image the web cannot display.
- Finding 10 no longer plans thumbnails, so HEIC/HEIF compatibility must be
  solved for the one original used by both preview and fullscreen.

### Implemented solution (the server never touches image bytes)

- Both mobile persistence entry points (`addWaypoint` and
  `addPhotoToWaypoint`) now use the same `saveNormalizedJpeg()` boundary. It
  explicitly re-encodes every picked/captured image with
  `expo-image-manipulator`, writes a `.jpg` local file and removes the temporary
  conversion output.
- Picker quality is `1` so it does not apply a first lossy compression;
  `saveNormalizedJpeg()` is the single controlled JPEG encoding at quality
  `0.85`.
- The uploader maps only JPEG, PNG and WebP extensions. HEIC/HEIF and unknown
  extensions now fail locally with a clear error instead of defaulting to JPEG
  metadata for incompatible bytes.
- The server does not convert or re-encode anything. It stays a pure object
  store: it accepts, stores and serves the bytes it is given.
- The server default and `.env.example` allowed-content-type lists now exclude
  `image/heic` and `image/heif`; `assertAllowedUpload()` also rejects both
  unconditionally so configuration cannot accidentally re-enable them. The
  request fails before a pre-signed PUT URL or database row is created.
- Finding 10 intentionally has no thumbnail pipeline. Its preview and
  fullscreen paths both use this normalized, web-renderable original.
- Existing images: HEIC/HEIF objects are not expected (current picker settings
  already re-encode to JPEG and the app is not in production). If any are
  found, handle them ad hoc (re-upload a JPEG rendition) rather than building a
  server-side conversion path.
- Mobile regression coverage verifies allowed mappings and explicit HEIC/HEIF
  rejection. Server regression coverage verifies that both MIME types receive
  `BadRequestException` under the default configuration.

### Acceptance criteria

- Every photo that can be persisted renders correctly in Chrome, Edge, Firefox
  and Safari on the web shared page, in both preview and fullscreen.
- No code path can persist an image that cannot be rendered by every client
  that displays it.

### Device verification result

- Reviewer confirmed the normalized photo upload/display flow works correctly
  on the Android local build on August 25, 2026.

## Finding 12: Local SQLite database is stored in plaintext

Status: **reported; threat model and encryption design required**
Priority: **P1**

### Symptom

Trailbook's SQLite database can be copied, opened and modified as an ordinary
SQLite file by a user or process with root access to the device. It contains
sensitive trip history, precise raw locations, waypoints and locally retained
application state.

### Security boundary

Android's application sandbox protects the database on an ordinary,
non-compromised device. Database encryption would materially improve protection
for extracted files, filesystem backups and offline inspection, but it cannot
guarantee confidentiality or integrity against an attacker with persistent root
access while Trailbook is running. Such an attacker may inspect application
memory, instrument the process, invoke app code or obtain a key after the user
unlocks the device.

The goal must therefore be stated as encryption at rest and resistance to
casual/offline database extraction, not absolute protection from a fully
compromised operating system.

### Build-environment policy

- `local` uses plaintext SQLite by default so developers can inspect and edit
  test data with ordinary SQLite tooling while debugging capture, migrations
  and processing.
- `qa` and `prod` require an encrypted database. They must fail with a
  controlled startup error if encrypted storage cannot be opened; they must
  never silently create or fall back to a plaintext database.
- Provide a dedicated `localEncrypted` build variant, or an equivalently
  compile-time-guarded local-only option, for exercising key creation,
  encryption and plaintext-to-encrypted migration on a development device.
- Encryption selection must be fixed by the native build configuration. A
  runtime preference, remotely supplied value or production environment
  variable must not be able to disable it.
- Local and encrypted variants must use distinct application identifiers and
  storage directories so installing or testing one cannot reinterpret or
  overwrite the other's database.

### Investigation and design

- Inventory sensitive data stored in SQLite, preferences, files, image caches,
  diagnostics and Android backups; encrypting only the main database must not
  create an incorrect security claim.
- Verify a maintained SQLCipher-compatible solution for Expo/React Native,
  Drizzle migrations, Android and iOS before selecting an implementation.
- Generate a random per-installation database key and protect it with Android
  Keystore and iOS Keychain. Do not derive it from a hard-coded application
  secret, user email or password, and do not sync or log it.
- Define behavior for device lock, biometric/key invalidation, reinstall,
  logout, account switching and restore onto a different device.
- Build an atomic, recoverable plaintext-to-encrypted migration with free-space
  checks and interruption testing. Never delete the plaintext database until
  the encrypted copy has been opened and verified.
- Exclude databases, keys and sensitive capture files from cloud/device backup
  unless an explicitly encrypted restore design is implemented and tested.
- Treat server authorization and sync validation as authoritative. Local
  encryption must not be relied on to prevent a rooted user from editing local
  Premium, ownership or sync state.
- Document the residual risk on rooted/jailbroken devices and avoid presenting
  root detection as a security boundary; it may only be a diagnostic or warning.

### Acceptance criteria

- Copying the database file from application storage does not reveal schema or
  user data through ordinary SQLite tooling without the per-installation key.
- The encryption key is not present in source, environment files, SQLite,
  ordinary preferences, logs, exports or backups.
- Existing installations migrate without losing trips, raw samples, waypoints,
  photos or reprocessing snapshots, including recovery from interruption.
- Fresh install, upgrade, logout/login, account switching and application
  restart work on both Android and iOS.
- Automated/build checks prove that `qa` and `prod` require encryption and that
  their database files cannot be opened with ordinary `sqlite3`. The encrypted
  local variant covers migration from a representative plaintext database.
- Backup configuration and adjacent local files match the documented threat
  model, and the product makes no promise of protection against active,
  persistent root-level compromise.

## Closed-test operational findings

These are not currently application defects, but they affect the validity of the
test.

### Tester access

- Email addresses in the Play closed-test list must exactly match the tester's
  Google Play account.
- Incorrect addresses can be corrected and testers can be added later.
- Country availability can cause `Not Found`; Serbia is currently selected for
  the closed track, while Kosovo is not offered as a separate Play Console entry.
- Testers must opt in and remain opted in continuously for 14 days.
- At least 12 opted-in testers are required; merely receiving the email is not
  enough.

### Tester expectations

- Some testers did not understand the opt-in/install sequence.
- Some supplied unusable Google accounts or were outside the selected country.
- Feedback sent directly to the developer is useful for product triage, but it
  is not automatically visible to Google as Play feedback.
- Tester instructions should use plain Serbian and distinguish required steps
  from optional Premium-purchase testing.

## Feedback register

Add new reports here before creating implementation tasks.

| ID | Date | Tester/device | Report | Evidence | Status | Priority |
|---|---|---|---|---|---|---|
| CT-01 | 2026-08-11 | Svetozar / unknown | Active test Premium not recognized before visiting Premium options | Screenshot, DB entitlement and Android local-build regression | Fixed and verified August 25 | P1 |
| CT-02 | 2026-08 | At least one tester / unknown | Generic startup failure; retry ineffective | Exact UI message only | Evidence needed | P1 |
| CT-03 | 2026-08-09 | ovthemija / Android | Long active recording with missing callbacks | Raw bundle | Device inspection pending | P1 |
| CT-04 | 2026-08 | Reviewer Android test | Long recording survived and resumed | Raw bundle | Control case; not reproduction | P2 |
| CT-05 | 2026-08 | Multiple | Closed-test link `Not Found` | Wrong email/country cases | Operational | P3 |
| CT-06 | 2026-08-12 | `Razvoz robe` / Android tester | Entirely DRIVE journey contains a BIKE segment because initial `ON_BICYCLE:60` was locked despite a longer `IN_VEHICLE:70` run | Raw bundle, segment speeds/accuracy, copied-bundle replay and Android local-build regression | Fixed and verified August 25 | P2 |
| CT-07 | 2026-08-11 | Android tester / device unknown | Current route becomes a dense self-crossing path while a large batch is processed; route corrects after Stop | Screenshot and post-stop observation | Reopen-without-stop and raw bundle needed | P1 |
| CT-08 | 2026-08-11 | Android tester / SM-A566B, API 36 | Trip lasted about 26 minutes but remained at 0 km; all 36 raw points had 81-200 m accuracy and failed the 25 m processor threshold | Raw bundle and source threshold | Zero-distance cause confirmed; poor accuracy/batching cause still under investigation | P1 |
| CT-09 | 2026-08-11 | Android tester / Novi Sad | Completed 342 m walking route contains implausible straight jumps; 518 raw entries collapse to 239 timestamps, only 68 pass 25 m accuracy, and overlapping 139/140/141-point batches repeat data | Raw bundle and shared-trip screenshot | Contributing causes confirmed; processor/rendering policy investigation pending | P1 |
| CT-10 | 2026-08-11 | Reviewer / Android and iOS comparison | `Andr setnja` initially ended at 21:06 although valid raw locations continued to 21:17; Stop raced a 150-location callback, while manual Reprocess restored the complete route | Both production bundles, segment boundaries, callback events, source flow and successful Reprocess | Root cause confirmed | P1 |
| CT-11 | 2026-08-19 | Reviewer / Android and iOS shared trip | Shared-trip waypoint photos load slowly in Trip Details and the fullscreen viewer can load forever | Removed serial S3 validation; originals now use a persistent local cache with single-flight downloads, timeout, signed-URL refresh and explicit loading/error/retry UI | Completed; Android device regression passed August 25 | P2 |
| CT-12 | 2026-08-25 | Internal security review / rooted device | Local SQLite database can be opened and modified directly with root access | Plaintext database inspection | Threat model and encryption design required | P1 |

## Proposed order after feedback collection

Do not start these slices until the current review/test evidence is sufficiently
complete.

1. Reproduce and instrument the startup failure.
2. Synchronize Stop with in-flight Android callback persistence and add the
   large-final-batch regression test.
3. Reproduce large-batch ingestion while the current-trip map is open and make
   route publication atomic and idempotent.
4. Fix authoritative Premium refresh at lifecycle and enforcement boundaries.
5. Inspect the affected long-recording phone and improve recording health
   diagnostics.
6. Validate segmentation changes against cloned real raw bundles.
7. Add route-gap plausibility rules and replay the Novi Sad zigzag fixture.
8. Decide and remove the temporary tester entitlement path.
9. ~~Complete shared-photo local caching and normalize mobile photos to JPEG;
   reject HEIC/HEIF in both the uploader and server.~~ Completed in Findings 10
   and 11. Web fullscreen remains a later web-link-share enhancement.
10. Build one consolidated next AAB and run focused regression tests before
    submitting it.

## Exit criteria for closed-test triage

- Every P1 report has either a confirmed root cause or enough diagnostics in the
  next build to obtain one.
- No production tester data is modified during analysis.
- Premium state refresh behavior is defined for startup, foreground and offline
  use.
- Long-recording failure modes are distinguishable in logs and UI.
- Large or delayed location batches cannot expose partially processed route
  geometry to the current-trip map.
- Representative raw bundles are preserved as sanitized regression fixtures
  where privacy permits.
- The next AAB scope is explicit and does not mix unrelated feature work with
  closed-test fixes.
