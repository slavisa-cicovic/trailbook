# Android R8 test build

The isolated `localEncryptedOptimized` build type inherits the release build
and always enables R8 minification and resource shrinking. Existing debug,
release and production variants are unchanged.

## Build and install

From the repository root, build the E2E-enabled version when running the
automated navigation and memory scenario:

```bash
npm run android:local:encrypted:optimized:e2e --workspace mobile
npm run test:android:memory --workspace mobile
```

For manual testing without the E2E control:

```bash
npm run android:local:encrypted:optimized --workspace mobile
```

The optimized build replaces the installed local encrypted build because both
use `com.slavisacicovic.trailbook.local.encrypted`. It never replaces the
production application.

## Mapping file

After a successful build, retain this file together with the matching APK/AAB:

```text
mobile/android/app/build/outputs/mapping/localEncryptedOptimized/mapping.txt
```

Do not use a mapping file from another build to deobfuscate crash reports.

## Required checks

- application startup and authentication;
- existing SQLCipher database opens and migrations complete;
- map, Trip Details, waypoint details and fullscreen photos;
- start, background, resume and stop recording;
- sync and restore;
- purchase and entitlement restoration;
- automated Android memory navigation test.
