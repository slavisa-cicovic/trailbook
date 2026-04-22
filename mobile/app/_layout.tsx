import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import "../src/services/recording/background-recording-task";
import { getAppTheme, resolveAppThemeMode } from "../src/constants/app-theme";
import { syncBackgroundLocationTracking } from "../src/services/location/location.service";
import { syncResolvedRecordingConfig } from "../src/services/recording/recording-config.service";
import {
  hydrateRecordingStore,
  reconcileHydratedRecordingState,
  useRecordingStore,
} from "../src/state/recording-store";
import { hydrateSessionStore, useSessionStore } from "../src/state/session-store";
import { hydrateThemeStore, useThemeStore } from "../src/state/theme-store";
import {
  getTripSegmentsStateSnapshot,
  hydrateTripSegmentsStore,
  useTripSegmentsStore,
} from "../src/state/trip-segments-store";
import { hydrateTripPausesStore, useTripPausesStore } from "../src/state/trip-pauses-store";
import { hydrateTripPointsStore, useTripPointsStore } from "../src/state/trip-points-store";
import { getTripsStateSnapshot, hydrateTripsStore, useTripsStore } from "../src/state/trips-store";
import {
  hydrateWaypointAttachmentsStore,
  useWaypointAttachmentsStore,
} from "../src/state/waypoint-attachments-store";
import { hydrateWaypointsStore, useWaypointsStore } from "../src/state/waypoints-store";

export default function RootLayout() {
  const sessionHydrated = useSessionStore((state) => state.hydrated);
  const identitySession = useSessionStore((state) => state.identitySession);
  const themeHydrated = useThemeStore((state) => state.hydrated);
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const recordingHydrated = useRecordingStore((state) => state.hydrated);
  const recordingStatus = useRecordingStore((state) => state.session.status);
  const activeRecordingTripId = useRecordingStore((state) => state.session.activeTripId);
  const activeRecordingProfile = useRecordingStore((state) => state.session.recordingProfile);
  const tripsHydrated = useTripsStore((state) => state.hydrated);
  const tripSegmentsHydrated = useTripSegmentsStore((state) => state.hydrated);
  const tripPausesHydrated = useTripPausesStore((state) => state.hydrated);
  const tripPointsHydrated = useTripPointsStore((state) => state.hydrated);
  const waypointsHydrated = useWaypointsStore((state) => state.hydrated);
  const waypointAttachmentsHydrated = useWaypointAttachmentsStore((state) => state.hydrated);

  const resolvedThemeMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedThemeMode);

  useEffect(() => {
    async function hydrateAppState() {
      await Promise.all([
        hydrateThemeStore(),
        hydrateSessionStore(),
        hydrateRecordingStore(),
        hydrateTripsStore(),
        hydrateTripPausesStore(),
        hydrateTripSegmentsStore(),
        hydrateTripPointsStore(),
        hydrateWaypointsStore(),
        hydrateWaypointAttachmentsStore(),
      ]);
      await reconcileHydratedRecordingState(
        getTripsStateSnapshot().trips,
        getTripSegmentsStateSnapshot().tripSegments,
      );
    }

    void hydrateAppState();
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

  if (
    !themeHydrated ||
    !sessionHydrated ||
    !recordingHydrated ||
    !tripsHydrated ||
    !tripPausesHydrated ||
    !tripSegmentsHydrated ||
    !tripPointsHydrated ||
    !waypointsHydrated ||
    !waypointAttachmentsHydrated
  ) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
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
        <Stack.Screen name="trips/[tripId]" />
        <Stack.Screen name="settings" options={{ animation: "none" }} />
      </Stack>
      <StatusBar style={resolvedThemeMode === "night" ? "light" : "dark"} />
    </GestureHandlerRootView>
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
