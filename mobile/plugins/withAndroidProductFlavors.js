const { withAndroidManifest, withAppBuildGradle } = require('expo/config-plugins');

const DEBUGGABLE_VARIANTS = '    debuggableVariants = ["localDebug", "qaDebug", "prodDebug"]';
const PRODUCT_FLAVORS = `    flavorDimensions "environment"

    productFlavors {
        local {
            dimension "environment"
            applicationIdSuffix ".local"
            versionNameSuffix "-local"
            resValue "string", "app_name", "Trailbook Local"
            manifestPlaceholders = [authRedirectScheme: "trailbook-local"]
        }
        qa {
            dimension "environment"
            applicationIdSuffix ".test"
            versionNameSuffix "-test"
            resValue "string", "app_name", "Trailbook Test"
            manifestPlaceholders = [authRedirectScheme: "trailbook-test"]
        }
        prod {
            dimension "environment"
            resValue "string", "app_name", "Trailbook"
            manifestPlaceholders = [authRedirectScheme: "trailbook"]
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
    if (!source.includes('flavorDimensions "environment"')) {
      source = source.replace('android {', `android {\n${PRODUCT_FLAVORS}`);
    }
    gradleConfig.modResults.contents = source;
    return gradleConfig;
  });

  return withAndroidManifest(config, (manifestConfig) => {
    const activities = manifestConfig.modResults.manifest.application?.[0]?.activity ?? [];
    for (const activity of activities) {
      for (const intentFilter of activity['intent-filter'] ?? []) {
        for (const data of intentFilter.data ?? []) {
          if (data.$?.['android:scheme'] === 'trailbook') {
            data.$['android:scheme'] = '${authRedirectScheme}';
          }
        }
      }
    }
    return manifestConfig;
  });
}

module.exports = withAndroidProductFlavors;
