# PLAN 76: Android 2027 Quality Requirements

Status: In progress
Created: August 28, 2026
Owners: Mobile / Android

## Objective

Keep Trailbook eligible for full Google Play publishing and visibility when the
new Android quality requirements begin enforcement in 2027, without destabilizing
recording, background location, purchases, maps, photos or encrypted storage.

This plan covers three independent requirements:

1. dynamic and bitmap memory health;
2. DEX optimization, shrinking and obfuscation;
3. secure Zero-Tap Sign-In during Android device migration.

It is intentionally separate from completed `PLAN_75`: none of these items is a
defect in the August 2026 production release.

## External deadlines and thresholds

### February 2027: memory and code optimization

Google Play evaluates memory over a rolling 28-day window using the 90th
percentile, split by application state and device RAM tier. For ordinary apps
on the lowest evaluated 4 GB tier, the announced bad-behavior thresholds are:

- foreground Anon RSS + Swap: 2 GB;
- user-perceived service: 1 GB;
- background: 1 GB;
- bitmap memory outside the foreground: 200 MB, or 400 MB while cached.

Apps with non-negligible DEX size must achieve at least 25% optimization,
shrinking and obfuscation. For apps, the announced DEX-size floor is 10 MB.

References:

- <https://support.google.com/googleplay/android-developer/answer/17492799>
- <https://android-developers.googleblog.com/2026/08/app-quality-memory-optimization-secure-onboarding.html>

### April 2027: Zero-Tap Sign-In

Apps that support sign-in must use Android Restore Credentials so an existing
signed-in user can be recognized securely after moving to a new Android device.

This is authentication restoration, not unrestricted transfer of Trailbook's
local encrypted database or per-install SQLCipher key.

## Current Trailbook baseline

- The August 2026 production AAB uses `minifyEnabled false` and
  `shrinkResources false`; no R8 mapping file is therefore produced.
- Long-running Android recording previously exposed an application-memory/OOM
  failure. `PLAN_75` fixed the known retained location queue, but production
  memory vitals must confirm that no other growth path remains.
- Shared photos are cached on disk, but full-resolution images can still create
  large decoded bitmap allocations while visible.
- Authentication tokens and the SQLCipher key use SecureStore. The SQLCipher
  key is intentionally per installation and must not become a portable device
  migration credential.
- Server restore already provides the correct cross-device path for synced trip
  data after authentication is recovered.

## Workstream 1: Production memory baseline

Status: Pending production telemetry

1. Allow the August 2026 production release to accumulate sufficient Android
   Vitals samples.
2. Record P50/P90 Anon RSS + Swap by:
   - foreground;
   - user-perceived recording service;
   - background;
   - device RAM tier;
   - app release.
3. Review the OS memory-termination/OOM filter and correlate any event with:
   - active recording duration and raw-location count;
   - opening Trip Details or fullscreen photos;
   - restore and shared-photo download;
   - repeated navigation between maps and photo screens.
4. Establish a release baseline and alert margin well below Google's thresholds;
   passing only narrowly is not acceptable.

### Focused profiling scenarios

- 12-24 hour foreground-service recording with locked screen;
- Stop processing after a long recording;
- route containing the largest representative raw bundle;
- repeated open/close of Trip Details and waypoint photo viewer;
- shared trip containing many original-resolution photos;
- restore followed by immediate browsing of restored photos;
- backgrounding from every photo-heavy screen.

Use Android Studio Memory Profiler/heap dumps and Perfetto where Vitals identifies
a suspicious process state. Do not add permanent coordinate-bearing diagnostics.

### Acceptance criteria

- Memory reaches a stable plateau in long-running recording and navigation
  loops rather than growing with elapsed time or visit count.
- No production low-memory/OOM termination is attributable to Trailbook state
  retention.
- P90 remains comfortably below the applicable threshold in every populated RAM
  tier and process state.

## Workstream 2: Bitmap lifecycle

Status: In progress

Implementation progress:

- The fullscreen waypoint photo viewer mounts only the current image and one
  adjacent image on either side, instead of decoding every photo in the trip.
- Fullscreen photo and map-preview resources are unmounted while the app is not
  active so they are not deliberately retained in background state.
- The bounded fullscreen photo lifecycle was functionally verified on the
  Android `localEncryptedRelease` build on September 7, 2026. Memory plateau
  behavior still requires measurement; functional verification alone does not
  close this workstream.

Initial device measurements (September 7, 2026, Galaxy S21):

- Before the controlled navigation loop: 569 MB RSS, 417 MB PSS, 53 MB
  graphics and 126 MB native heap.
- After repeatedly opening Trip Details/fullscreen photos and backgrounding:
  632 MB RSS, 477 MB PSS, 78 MB graphics and 169 MB native heap.
- The first loop remains below the 200 MB background bitmap target, but the
  roughly 60 MB PSS increase requires repeated-loop and settled-background
  measurements before concluding that memory reaches a plateau.
- The next user-driven loop ran in a new process (`25957`, replacing `23304`),
  so it cannot be used as a same-process leak comparison. Its settled background
  readings were 559 MB RSS, 405 MB PSS, 87 MB graphics and 137 MB native heap.
  Android logs show normal activity stop and background garbage collection,
  with no fatal exception or OOM. A further loop must retain the same PID.
- A same-process loop on PID `25957` increased settled background graphics from
  87 MB to 217 MB and PSS from 405 MB to 531 MB. Java/background GC freed its
  allocations, but GL memory remained at 189 MB (`GL mtrack`), while native heap
  stayed broadly stable. This is a reproducible investigation finding, not a
  pass: isolate Trip Details maps from fullscreen photo navigation before making
  another optimization.
- Isolation run on PID `26585`: repeatedly opening and closing Trip Details
  without fullscreen photos ended at 472 MB RSS, 318 MB PSS and only 6 MB
  graphics. The Trip Details map therefore released its graphics allocation in
  background and is not the primary source of the earlier 217 MB graphics
  retention. The next isolation step targets fullscreen photo navigation.
- On the same PID (`26585`), repeated in-app fullscreen photo navigation raised
  background graphics from 6 MB to 54 MB and PSS from 318 MB to 393 MB; native
  heap rose from 82 MB to 137 MB. Fullscreen navigation is therefore a
  contributor, but the measured graphics level remains below 200 MB. Repeat the
  identical cycle before deciding whether this is a one-time native cache or
  monotonic retention.
- A second identical fullscreen cycle on PID `26585` held graphics at 51 MB
  (down from 54 MB), while PSS/RSS changed by only about 9 MB. This controlled
  scenario therefore reaches a graphics plateau rather than accumulating one
  additional decoded set per visit.
- Android preview images now explicitly request decode-time resizing; original
  files remain unchanged for fullscreen viewing and upload.
- The rebuilt `localEncryptedRelease` combined preview/fullscreen test on PID
  `28320` held background graphics at 58 MB versus a 66 MB startup baseline.
  After background GC, PSS settled at 376 MB and native heap at 135 MB. Together
  with the preceding same-process plateau test, this locally validates the
  bounded viewer/downsample implementation; large-photo-set and production
  telemetry gates remain open.
- A repeatable Maestro + ADB regression harness now drives Trip Details,
  waypoint details, fullscreen photo swipes and backgrounding, then records PSS,
  RSS, native heap, graphics/GL and swap into an ignored CSV report. Its first
  three-cycle run on September 7 retained PID `31711`: graphics warmed from
  9 MB to 47 MB in cycle 1 and then stayed at 47 MB, while PSS declined from
  411 MB to 399 MB and then 382 MB. This confirms a plateau rather than
  visit-count growth in the automated scenario. The harness fails on a process
  restart or conservative graphics/RSS limits and uses a dedicated E2E build
  hook because native map markers are absent from Android's accessibility tree.

1. Measure decoded bitmap memory, not only image file size on disk.
2. Confirm that photo screens release native image resources after navigation or
   backgrounding.
3. Avoid mounting every full-resolution photo simultaneously. Render only the
   visible item and a small bounded neighbor set in fullscreen navigation.
4. Downsample previews to their rendered dimensions. Keep originals on disk for
   explicit fullscreen viewing and upload.
5. Bound any image memory cache by device RAM tier; disk cache may remain
   independent and persistent.

### Acceptance criteria

- Background/user-perceived-service bitmap P90 remains below 200 MB with margin.
- Repeated photo navigation does not produce monotonic native-memory growth.
- Airplane-mode reuse of the disk cache from Finding 10 continues to work.

## Workstream 3: R8 and resource shrinking

Status: Pending isolated build experiment

Do not first enable R8 in a store-bound production build. Introduce a dedicated
release-equivalent QA profile or compile-time switch with:

```properties
android.enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
```

### Tasks

1. Produce an optimized release-equivalent AAB/APK and inspect Play's DEX
   optimization report.
2. Keep only the narrow ProGuard/R8 rules required by libraries that genuinely
   use reflection or JNI. Do not suppress optimization globally.
3. Verify native/reflective boundaries:
   - Expo Router and React Native startup;
   - background location task and foreground service;
   - `trailbook-native-location` callbacks;
   - Expo IAP purchase and restore flows;
   - SQLCipher and Drizzle migrations;
   - maps and Google configuration;
   - image picker/manipulator;
   - SecureStore and authentication callbacks.
4. Retain and archive the generated `mapping.txt` per build.
5. Ensure the mapping file is uploaded with the matching Play bundle so crashes
   and ANRs are deobfuscated.
6. Compare AAB, DEX and installed size before/after optimization.

### Acceptance criteria

- Play Console reports at least 25% optimization, shrinking and obfuscation when
  the DEX-size requirement applies.
- All critical-device regressions pass on the optimized binary.
- Production crash/ANR stack traces are deobfuscated with the exact mapping from
  their version code.

## Workstream 4: Restore Credentials / Zero-Tap Sign-In

Status: Design required

### Security model

- Restore only an opaque, server-verifiable credential suitable for device
  migration.
- Do not migrate access tokens, passwords, the SQLCipher database key, database
  files, raw location files or photo caches through Restore Credentials.
- The backend remains authoritative and must be able to revoke, rotate and
  exchange the restored credential for a normal Trailbook session.
- After sign-in recovery, existing server restore retrieves user-authorized trip
  data. Un-synced device-only data cannot be promised on a new device.

### Tasks

1. Select the official Android Restore Credentials integration compatible with
   the current Expo/React Native native build.
2. Define backend issuance, hashing/storage, expiration, rotation, revocation and
   single-/multi-use semantics for restore credentials.
3. Create/update the credential only after a fully authenticated session.
4. Clear or invalidate it on logout, account deletion, credential compromise and
   relevant server-side revocation.
5. On first launch after device migration:
   - retrieve the restored credential;
   - exchange it with the backend;
   - establish normal SecureStore session tokens;
   - refresh entitlement;
   - offer/perform the existing server data restore;
   - fail safely to the ordinary login screen when restoration is unavailable.
6. Keep Google and Apple login available as normal recovery fallbacks.

### Required tests

- supported old-device to new-device transfer while signed in;
- transfer after logout and after account deletion;
- expired/revoked/used/invalid restore credential;
- offline first launch followed by later connectivity;
- multiple new devices and repeated migration;
- local encrypted database remains a fresh per-install database/key;
- server restore recovers only data owned by the authenticated user;
- entitlement and purchase restoration remain authoritative.

### Acceptance criteria

- A valid signed-in user is recognized on first launch after supported Android
  device migration without an interactive login step.
- No reusable secret or SQLCipher key is exposed in backup payloads or logs.
- Invalid restoration cannot create a session or reveal another user's data.
- Failure gracefully falls back to the existing login and restore experience.

## Delivery order

1. September-October 2026: accumulate and review production memory/bitmap
   telemetry; profile only if evidence or margins require it.
2. October-November 2026: build and validate the isolated R8-enabled variant.
3. No later than December 2026: ship R8 in a staged/internal release and confirm
   Play optimization/mapping results before February enforcement.
4. Q4 2026: finalize Restore Credentials/backend design and native feasibility.
5. January-February 2027: implement and test device migration end to end.
6. No later than March 2027: ship and verify Zero-Tap Sign-In before April
   enforcement.

## Release gates

- R8 and memory work must not regress long-running/background recording.
- Zero-Tap Sign-In must pass security review before production rollout.
- Each store build retains its mapping, version code, test evidence and Vitals
  baseline.
- Enforcement dates must be rechecked against current official Google guidance
  before final rollout because Google may refine thresholds or timelines.
