const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

module.exports = {
  expo: {
    name: "Trailbook",
    slug: "trailbook",
    scheme: "trailbook",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/app-icon.png",
    plugins: [
      "expo-router",
      "expo-secure-store",
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
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
        },
      ],
    ],
    assetBundlePatterns: ["**/*"],
    ios: {
      icon: "./assets/app-icon.png",
      supportsTablet: false,
      bundleIdentifier: "com.slavisacicovic.trailbook",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
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
