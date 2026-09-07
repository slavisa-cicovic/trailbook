const { copyFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require('expo/config-plugins');

const DEBUGGABLE_VARIANTS = '    debuggableVariants = ["localDebug", "localEncryptedDebug", "qaDebug", "prodDebug"]';
const OPTIMIZED_BUILD_TYPE = `        optimized {
            initWith release
            matchingFallbacks = ["release"]
            signingConfig = signingConfigs.debug
            versionNameSuffix "-optimized"
            shrinkResources = true
            minifyEnabled true
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
`;
const PRODUCT_FLAVORS = `    flavorDimensions "environment"

    productFlavors {
        local {
            dimension "environment"
            applicationIdSuffix ".local"
            versionNameSuffix "-local"
            resValue "string", "app_name", "Trailbook Local"
            manifestPlaceholders = [
                authRedirectScheme: "trailbook-local",
                appIcon: "@drawable/trailbook_local_icon",
                appRoundIcon: "@drawable/trailbook_local_icon"
            ]
        }
        localEncrypted {
            dimension "environment"
            applicationIdSuffix ".local.encrypted"
            versionNameSuffix "-local-encrypted"
            resValue "string", "app_name", "Trailbook Local Encrypted"
            manifestPlaceholders = [
                authRedirectScheme: "trailbook-local-encrypted",
                appIcon: "@drawable/trailbook_local_icon",
                appRoundIcon: "@drawable/trailbook_local_icon"
            ]
        }
        qa {
            dimension "environment"
            applicationIdSuffix ".test"
            versionNameSuffix "-test"
            resValue "string", "app_name", "Trailbook Test"
            manifestPlaceholders = [
                authRedirectScheme: "trailbook-test",
                appIcon: "@mipmap/ic_launcher",
                appRoundIcon: "@mipmap/ic_launcher_round"
            ]
        }
        prod {
            dimension "environment"
            resValue "string", "app_name", "Trailbook"
            manifestPlaceholders = [
                authRedirectScheme: "trailbook",
                appIcon: "@mipmap/ic_launcher",
                appRoundIcon: "@mipmap/ic_launcher_round"
            ]
        }
    }
`;

function withAndroidProductFlavors(config) {
  config = withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') return gradleConfig;
    let source = gradleConfig.modResults.contents;
    if (!source.includes('debuggableVariants = ["localDebug"')) {
      source = source.replace('react {', `react {\n${DEBUGGABLE_VARIANTS}`);
    }
    if (source.includes('flavorDimensions "environment"')) {
      source = source.replace(
        /    flavorDimensions "environment"[\s\S]*?(?=    ndkVersion)/,
        PRODUCT_FLAVORS,
      );
    } else {
      source = source.replace('android {', `android {\n${PRODUCT_FLAVORS}`);
    }
    if (!source.includes('        optimized {')) {
      source = source.replace(
        /(    buildTypes \{[\s\S]*?)(\n    \}\n    packagingOptions \{)/,
        `$1\n${OPTIMIZED_BUILD_TYPE}$2`,
      );
    }
    // Expo CLI currently resolves the native app ID using the Groovy
    // `applicationId '…'` form and does not recognize the equivalent
    // assignment form emitted by the current prebuild template.
    source = source.replace(/applicationId\s*=\s*(['"][^'"]+['"])/, 'applicationId $1');
    gradleConfig.modResults.contents = source;
    return gradleConfig;
  });

  return withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (application?.$) {
      application.$['android:icon'] = '${appIcon}';
      application.$['android:roundIcon'] = '${appRoundIcon}';
    }
    const activities = application?.activity ?? [];
    for (const activity of activities) {
      for (const intentFilter of activity['intent-filter'] ?? []) {
        for (const data of intentFilter.data ?? []) {
          if (data.$?.['android:scheme'] === 'trailbook') {
            data.$['android:scheme'] = '${authRedirectScheme}';
          }
        }
        const seenSchemes = new Set();
        intentFilter.data = (intentFilter.data ?? []).filter((data) => {
          const scheme = data.$?.['android:scheme'];
          if (!scheme || !seenSchemes.has(scheme)) {
            if (scheme) seenSchemes.add(scheme);
            return true;
          }
          return false;
        });
      }
    }
    return manifestConfig;
  });
}

function withLocalAndroidIcon(config) {
  return withDangerousMod(config, [
    'android',
    (dangerousConfig) => {
      for (const flavor of ['local', 'localEncrypted']) {
        const localSourceDirectory = join(
          dangerousConfig.modRequest.platformProjectRoot,
          'app',
          'src',
          flavor,
        );
        const drawableDirectory = join(localSourceDirectory, 'res', 'drawable');
        mkdirSync(drawableDirectory, { recursive: true });
        copyFileSync(
          join(dangerousConfig.modRequest.projectRoot, 'assets', 'app-icon-local.png'),
          join(drawableDirectory, 'trailbook_local_icon.png'),
        );
        writeFileSync(
          join(localSourceDirectory, 'AndroidManifest.xml'),
          `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:usesCleartextTraffic="true" />
</manifest>
`,
        );
      }
      return dangerousConfig;
    },
  ]);
}

module.exports = (config) => withLocalAndroidIcon(withAndroidProductFlavors(config));
