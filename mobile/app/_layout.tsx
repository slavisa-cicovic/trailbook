import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { getAppTheme, resolveAppThemeMode } from "../src/constants/app-theme";
import {
  hydrateRecordingStore,
  reconcileHydratedRecordingState,
  useRecordingStore,
} from "../src/state/recording-store";
import { hydrateSessionStore, useSessionStore } from "../src/state/session-store";
import { hydrateThemeStore, useThemeStore } from "../src/state/theme-store";
import { hydrateTripPointsStore, useTripPointsStore } from "../src/state/trip-points-store";
import { getTripsStateSnapshot, hydrateTripsStore, useTripsStore } from "../src/state/trips-store";
import {
  hydrateWaypointAttachmentsStore,
  useWaypointAttachmentsStore,
} from "../src/state/waypoint-attachments-store";
import { hydrateWaypointsStore, useWaypointsStore } from "../src/state/waypoints-store";

export default function RootLayout() {
  const sessionHydrated = useSessionStore((state) => state.hydrated);
  const themeHydrated = useThemeStore((state) => state.hydrated);
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const recordingHydrated = useRecordingStore((state) => state.hydrated);
  const tripsHydrated = useTripsStore((state) => state.hydrated);
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
        hydrateTripPointsStore(),
        hydrateWaypointsStore(),
        hydrateWaypointAttachmentsStore(),
      ]);
      await reconcileHydratedRecordingState(getTripsStateSnapshot().trips);
    }

    void hydrateAppState();
  }, []);

  if (
    !themeHydrated ||
    !sessionHydrated ||
    !recordingHydrated ||
    !tripsHydrated ||
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
        <Stack.Screen name="recording" options={{ animation: "none" }} />
        <Stack.Screen name="trips/index" options={{ animation: "none" }} />
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
