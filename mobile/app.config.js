const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

module.exports = {
  expo: {
    name: "Trailbook",
    slug: "trailbook",
    scheme: "trailbook",
    version: "1.0.1",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/app-icon-release.png",
    plugins: [
      "./plugins/withAndroidProductFlavors",
      "./plugins/withLocationTaskPatch",
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/app-icon-release.png",
          imageWidth: 220,
          resizeMode: "contain",
          backgroundColor: "#f3efe6",
        },
      ],
      "expo-background-task",
      "expo-secure-store",
      [
        "expo-sqlite",
        {
          useSQLCipher: true,
        },
      ],
      "expo-web-browser",
      "expo-iap",
      [
        "expo-image-picker",
        {
          photosPermission:
            "Trailbook uses your photos so you can attach images to route waypoints.",
          cameraPermission:
            "Trailbook uses your camera so you can capture waypoint photos during recording.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Trailbook uses your location to show where you are and support trip recording.",
          locationAlwaysAndWhenInUsePermission:
            "Trailbook uses your location to keep recording trips when the app is in the background or the screen is locked.",
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: false,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
    ],
    updates: {
      url: "https://u.expo.dev/34a686f3-39be-4580-a53e-eebbf40627b5",
    },
    runtimeVersion: "1.0.0",
    assetBundlePatterns: ["**/*"],
    ios: {
      icon: "./assets/app-icon-release.png",
      supportsTablet: false,
      bundleIdentifier: "com.slavisacicovic.trailbook",
      entitlements: {
        "com.apple.developer.applesignin": ["Default"],
      },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "Trailbook uses your location to show where you are and support trip recording.",
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "Trailbook uses your location to keep recording trips when the app is in the background or the screen is locked.",
        NSLocationAlwaysUsageDescription:
          "Trailbook uses your location to keep recording trips when the app is in the background or the screen is locked.",
        NSMotionUsageDescription:
          "Trailbook uses motion activity to distinguish walking, cycling, and driving more reliably in auto mode.",
        UIBackgroundModes: ["location"],
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          NSAllowsLocalNetworking: true,
        },
      },
      config: {
        usesNonExemptEncryption: false,
        ...(googleMapsApiKey
          ? {
              googleMapsApiKey,
            }
          : {}),
      },
    },
    android: {
      package: "com.slavisacicovic.trailbook",
      blockedPermissions: ["android.permission.ACCESS_BACKGROUND_LOCATION"],
      permissions: [
        "android.permission.ACTIVITY_RECOGNITION",
        "android.permission.CAMERA",
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_LOCATION",
        "android.permission.POST_NOTIFICATIONS",
      ],
      usesCleartextTraffic: true,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#f3efe6",
      },
      config: googleMapsApiKey
        ? {
            googleMaps: {
              apiKey: googleMapsApiKey,
            },
          }
        : undefined,
    },
    web: {
      favicon: "./assets/app-icon-release.png",
    },
    experiments: {
      typedRoutes: false,
    },
    extra: {
      hasGoogleMapsApiKey: Boolean(googleMapsApiKey),
      eas: {
        projectId: "34a686f3-39be-4580-a53e-eebbf40627b5",
      },
    },
  },
};
