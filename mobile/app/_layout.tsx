import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import "../src/services/recording/background-recording-task";
import { getAppTheme, resolveAppThemeMode } from "../src/constants/app-theme";
import { ErrorBoundary } from "../src/core/error-boundary";
import { setupGlobalErrorHandler } from "../src/core/global-error-handler";
import { initSentry } from "../src/core/sentry";
import { useAppHydration } from "../src/core/hooks/use-app-hydration";
import { syncBackgroundLocationTracking } from "../src/services/location/location.service";
import { syncResolvedRecordingConfig } from "../src/services/recording/recording-config.service";
import { useRecordingStore } from "../src/state/recording-store";
import { useSessionStore } from "../src/state/session-store";
import { useThemeStore } from "../src/state/theme-store";

export default function RootLayout() {
  const { appHydrated, sessionHydrated, recordingHydrated, tripsHydrated, tripSegmentsHydrated } =
    useAppHydration();

  const identitySession = useSessionStore((state) => state.identitySession);
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const recordingStatus = useRecordingStore((state) => state.session.status);
  const activeRecordingTripId = useRecordingStore((state) => state.session.activeTripId);
  const activeRecordingProfile = useRecordingStore((state) => state.session.recordingProfile);

  const resolvedThemeMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedThemeMode);

  useEffect(() => {
    initSentry();
    setupGlobalErrorHandler();
  }, []);

  useEffect(() => {
    if (!recordingHydrated || !tripsHydrated || !tripSegmentsHydrated) {
      return;
    }

    void syncBackgroundLocationTracking(
      recordingStatus,
      activeRecordingTripId,
      activeRecordingProfile,
    ).catch(() => undefined);
  }, [
    activeRecordingProfile,
    activeRecordingTripId,
    recordingHydrated,
    recordingStatus,
    tripSegmentsHydrated,
    tripsHydrated,
  ]);

  useEffect(() => {
    if (
      !recordingHydrated ||
      !tripsHydrated ||
      !tripSegmentsHydrated ||
      recordingStatus !== "recording" ||
      !activeRecordingTripId
    ) {
      return;
    }

    const intervalId = setInterval(() => {
      void syncBackgroundLocationTracking(
        recordingStatus,
        activeRecordingTripId,
        activeRecordingProfile,
      ).catch((error) => {
        console.warn("[Trailbook][background-watchdog] sync failed", error);
      });
    }, 30 * 1000);

    return () => clearInterval(intervalId);
  }, [
    activeRecordingProfile,
    activeRecordingTripId,
    recordingHydrated,
    recordingStatus,
    tripSegmentsHydrated,
    tripsHydrated,
  ]);

  useEffect(() => {
    if (!sessionHydrated) {
      return;
    }

    void syncResolvedRecordingConfig(identitySession)
      .then(() =>
        syncBackgroundLocationTracking(
          recordingStatus,
          activeRecordingTripId,
          activeRecordingProfile,
        ),
      )
      .catch(() => undefined);
  }, [
    activeRecordingProfile,
    activeRecordingTripId,
    identitySession?.role,
    identitySession?.sessionToken,
    identitySession?.userId,
    recordingStatus,
    sessionHydrated,
  ]);

  return (
    <ErrorBoundary>
      {!appHydrated ? (
        <View style={[styles.loadingScreen, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <GestureHandlerRootView style={styles.gestureRoot}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="register" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen name="recording" options={{ animation: "none" }} />
            <Stack.Screen name="trips/index" options={{ animation: "none" }} />
            <Stack.Screen name="trips/shared/[shareId]" />
            <Stack.Screen name="trips/shared/[shareId]/waypoints/[waypointId]" />
            <Stack.Screen name="trips/shared/[shareId]/waypoints/[waypointId]/photos/[attachmentId]" />
            <Stack.Screen name="trips/[tripId]" />
            <Stack.Screen name="trips/[tripId]/waypoints/[waypointId]" />
            <Stack.Screen name="trips/[tripId]/waypoints/[waypointId]/photos/[attachmentId]" />
            <Stack.Screen name="settings" options={{ animation: "none" }} />
            <Stack.Screen name="settings/about" options={{ animation: "none" }} />
            <Stack.Screen name="settings/recording-config" options={{ animation: "none" }} />
            <Stack.Screen name="settings/recording-config/[target]" options={{ animation: "none" }} />
          </Stack>
          <StatusBar style={resolvedThemeMode === "night" ? "light" : "dark"} />
        </GestureHandlerRootView>
      )}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
