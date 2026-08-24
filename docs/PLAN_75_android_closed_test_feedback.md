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

Status: **done; verification pending on next Android build**  
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

Status: **under investigation**  
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

## Finding 5: Temporary tester Premium lifecycle

Status: **test-only behavior; removal proposed**  
Priority: **P2**

### Current behavior

Closed-test users were given time-limited `premium_test` access so they did not
need to make real Google Play purchases. This is backend test access rather than
a Google Play lifetime product.

### Next-build decision

- Remove or disable the temporary `premium_test` workflow after the closed test.
- Ensure removal does not affect real Apple or Google purchases.
- Keep an explicit, audited admin-only mechanism only if future beta programs
  require it.
- Remove expired test entitlements after evidence needed for this test is saved.

## Finding 6: Current-trip route is corrupted while a large location batch is processed

Status: **reported; screenshot available**  
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

## Finding 7: Recording completes with duration but zero distance

Status: **raw bundle analyzed; root cause of zero processed distance confirmed**  
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

## Finding 8: Completed walking route contains long straight jumps and zigzags

Status: **raw bundle analyzed; contributing causes confirmed**  
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

## Finding 9: Stop can process an incomplete in-flight Android location batch

Status: **root cause confirmed; reprocessing verified the recovery**  
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

## Finding 10: Shared-trip photos load slowly or never in Trip Details and the fullscreen viewer

Status: **reported; code path identified, device timing evidence still needed**  
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

- `waypoint-images.service.ts` `getImages()` issues a serial `HeadObject` call
  to S3 for every image (a `for` loop, not parallel) and signs a GET URL with
  `expiresIn: 60 * 60` on every request. The shared-trip access endpoints
  (`/shared/trips/:token/access`, `/trips/shared-with-me/:clientTripId`, and
  the shared-with-me list) all call this per waypoint. Response time therefore
  grows linearly with photo count, and the returned URL expires after one hour.
- There is no thumbnail/resize mechanism anywhere in the stack. Originals
  (JPEG/PNG/HEIC/HEIF/WebP, up to the 10 MB upload limit) are served as-is to
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

- Generate the thumbnail on the mobile device at upload time
  (`expo-image-manipulator`, bounded ~400 px JPEG/WebP) and upload it as a
  sibling object (`media/images/{uuid}/thumb`) together with the original.
- No backfill for already-uploaded images: the app is not in production yet
  and the photo volume is small. Clients fall back to the full file whenever a
  thumbnail object is missing; the fallback can be revisited later.
- The NestJS server stores and serves objects only; it does not resize images
  or cache them on disk (S3/MinIO remains the only image store).

### Next-build investigation

- Instrument shared-trip image timing on the device: request start, bytes
  received, decode, first frame, for both the waypoint preview and fullscreen
  viewer; record HTTP status on failure.
- Mobile: generate the thumbnail at upload time with `expo-image-manipulator`
  and upload both objects (original + thumb). Extend
  `UploadWaypointImagesUseCase`/the image row so the thumb object key is
  recorded and the second PUT is part of the same retry-safe flow.
- Server: `getImages()` returns both `getUrl` and `thumbUrl`; parallelize the
  per-image serial `HeadObject` (or trust `uploadStatus = uploaded` +
  `remoteVerifiedAt` for listing).
- Cache shared-trip images on the device using the existing
  `photoStorage`/`saveRestoredPhoto` pattern and use the local file as
  `localUri`, so a second open does not re-download.
- Add loading and error states to `ZoomablePhoto` and the InfoWindow images; on
  403, refresh the pre-signed URL instead of leaving a black screen.
- Web: add a fullscreen/lightbox photo view with loading and error states and
  use `thumbUrl` (fallback `getUrl`) in the InfoWindow.

### Acceptance criteria

- Tapping a waypoint marker shows the preview thumbnail promptly even for
  waypoints with several photos.
- Waypoints without a thumbnail object still render via the full-file fallback.
- The fullscreen viewer shows the photo or a clear error within a defined time;
  an expired pre-signed URL is refreshed automatically.
- Opening a shared trip twice does not re-download images that are already
  cached locally.
- Shared-trip access response time does not grow linearly with photo count.
- The web shared-trip page loads thumbnails without fetching full originals and
  offers a working fullscreen view.

## Finding 11: HEIC/HEIF uploads can render as broken images on the web

Status: **identified in source; latent with current picker settings; direction decided**  
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
- Current picker calls pass `quality: 0.8/0.85`
  (`RecordingScreen`, `AddWaypointSheet`, `WaypointDetailScreen`), which on iOS
  re-encodes to JPEG. The defect is therefore latent today, but both the mobile
  path and the server accept HEIC/HEIF, so any future "original quality" pick
  or direct upload can persist an image the web cannot display.
- The thumbnails planned in Finding 10 are always JPEG/WebP, which fixes
  previews; the fullscreen original remains affected when its content type is
  HEIC/HEIF.

### Direction (clean approach: the server never touches image bytes)

- Normalize at pick time on the mobile device: the picker must always produce a
  JPEG (keep an explicit `quality` setting and/or re-encode with
  `expo-image-manipulator`), so HEIC/HEIF never enters the local store, the
  upload pipeline or S3. The stored local file and the upload content type are
  then always JPEG.
- The server does not convert or re-encode anything. It stays a pure object
  store: it accepts, stores and serves the bytes it is given.
- Narrow `MEDIA_UPLOAD_ALLOWED_CONTENT_TYPES` on the server to drop
  `image/heic` and `image/heif`, so a non-web-renderable upload is rejected
  outright instead of being persisted.
- Thumbnail generation (Finding 10) runs on the normalized JPEG, so a single
  source format covers preview and fullscreen everywhere.
- Existing images: HEIC/HEIF objects are not expected (current picker settings
  already re-encode to JPEG and the app is not in production). If any are
  found, handle them ad hoc (re-upload a JPEG rendition) rather than building a
  server-side conversion path.

### Acceptance criteria

- Every photo that can be persisted renders correctly in Chrome, Edge, Firefox
  and Safari on the web shared page, in both preview and fullscreen.
- No code path can persist an image that cannot be rendered by every client
  that displays it.

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
| CT-01 | 2026-08-11 | Svetozar / unknown | Active test Premium not recognized before visiting Premium options | Screenshot and DB entitlement | Partially reproduced | P1 |
| CT-02 | 2026-08 | At least one tester / unknown | Generic startup failure; retry ineffective | Exact UI message only | Evidence needed | P1 |
| CT-03 | 2026-08-09 | ovthemija / Android | Long active recording with missing callbacks | Raw bundle | Device inspection pending | P1 |
| CT-04 | 2026-08 | Reviewer Android test | Long recording survived and resumed | Raw bundle | Control case; not reproduction | P2 |
| CT-05 | 2026-08 | Multiple | Closed-test link `Not Found` | Wrong email/country cases | Operational | P3 |
| CT-06 | 2026-08-12 | `Razvoz robe` / Android tester | Entirely DRIVE journey contains a BIKE segment because initial `ON_BICYCLE:60` was locked despite a longer `IN_VEHICLE:70` run | Raw bundle, segment speeds/accuracy and tester confirmation of real journey | Failure mechanism confirmed; classifier redesign planned | P2 |
| CT-07 | 2026-08-11 | Android tester / device unknown | Current route becomes a dense self-crossing path while a large batch is processed; route corrects after Stop | Screenshot and post-stop observation | Reopen-without-stop and raw bundle needed | P1 |
| CT-08 | 2026-08-11 | Android tester / SM-A566B, API 36 | Trip lasted about 26 minutes but remained at 0 km; all 36 raw points had 81-200 m accuracy and failed the 25 m processor threshold | Raw bundle and source threshold | Zero-distance cause confirmed; poor accuracy/batching cause still under investigation | P1 |
| CT-09 | 2026-08-11 | Android tester / Novi Sad | Completed 342 m walking route contains implausible straight jumps; 518 raw entries collapse to 239 timestamps, only 68 pass 25 m accuracy, and overlapping 139/140/141-point batches repeat data | Raw bundle and shared-trip screenshot | Contributing causes confirmed; processor/rendering policy investigation pending | P1 |
| CT-10 | 2026-08-11 | Reviewer / Android and iOS comparison | `Andr setnja` initially ended at 21:06 although valid raw locations continued to 21:17; Stop raced a 150-location callback, while manual Reprocess restored the complete route | Both production bundles, segment boundaries, callback events, source flow and successful Reprocess | Root cause confirmed | P1 |
| CT-11 | 2026-08-19 | Reviewer / Android and iOS shared trip | Shared-trip waypoint photos load slowly in Trip Details and the fullscreen viewer can load forever | Source flow: `loadShared` uses the pre-signed S3 URL as `localUri`; 1 h URL expiry; serial per-image `HeadObject`; no thumbnail pipeline; no image error state | Code path identified; device timing evidence needed | P2 |

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
9. Add mobile-generated thumbnails (`expo-image-manipulator`) with full-file
   fallback, local caching for shared-trip images, and loading/error handling
   in the photo viewer (web and mobile); normalize captures to JPEG at pick
   time and drop HEIC/HEIF from the allowed upload types so the server never
   stores or converts non-web-renderable images.
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
