# Mobile

This app owns:

- trip recording UX
- local-first persistence
- manual sync initiation
- recording state visibility

The scaffold is intentionally small until `PLAN_02_mobile_recording.md` is executed.

## EAS build

The app is prepared for Expo Application Services (`EAS`) builds through:

- [eas.json](/home/slavisa/devel/vs_code/trailbook/mobile/eas.json)
- `eas:build:*` scripts in [package.json](/home/slavisa/devel/vs_code/trailbook/mobile/package.json)

Typical iOS device build flow:

1. `cd mobile`
2. `npx eas login`
3. `npx eas build:configure`
4. `npm run eas:build:ios:preview`

`preview` is the safest first device profile.
Use `production` only when the signing and App Store path are settled.
