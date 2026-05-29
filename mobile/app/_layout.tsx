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
import { hydrateTripGroupMembersStore, useTripGroupMembersStore } from "../src/state/trip-group-members-store";
import { hydrateTripGroupsStore, useTripGroupsStore } from "../src/state/trip-groups-store";
import { hydrateTripPausesStore, useTripPausesStore } from "../src/state/trip-pauses-store";
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
  const tripGroupsHydrated = useTripGroupsStore((state) => state.hydrated);
  const tripGroupMembersHydrated = useTripGroupMembersStore((state) => state.hydrated);
  const tripPausesHydrated = useTripPausesStore((state) => state.hydrated);
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
        hydrateTripGroupsStore(),
        hydrateTripGroupMembersStore(),
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

  if (
    !themeHydrated ||
    !sessionHydrated ||
    !recordingHydrated ||
    !tripsHydrated ||
    !tripGroupsHydrated ||
    !tripGroupMembersHydrated ||
    !tripPausesHydrated ||
    !tripSegmentsHydrated ||
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
