import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import {
  hydrateRecordingStore,
  reconcileHydratedRecordingState,
  useRecordingStore,
} from "../src/state/recording-store";
import { hydrateSessionStore, useSessionStore } from "../src/state/session-store";
import { getTripsStateSnapshot, hydrateTripsStore, useTripsStore } from "../src/state/trips-store";
import { hydrateWaypointsStore, useWaypointsStore } from "../src/state/waypoints-store";

export default function RootLayout() {
  const sessionHydrated = useSessionStore((state) => state.hydrated);
  const recordingHydrated = useRecordingStore((state) => state.hydrated);
  const tripsHydrated = useTripsStore((state) => state.hydrated);
  const waypointsHydrated = useWaypointsStore((state) => state.hydrated);

  useEffect(() => {
    async function hydrateAppState() {
      await Promise.all([
        hydrateSessionStore(),
        hydrateRecordingStore(),
        hydrateTripsStore(),
        hydrateWaypointsStore(),
      ]);
      await reconcileHydratedRecordingState(getTripsStateSnapshot().trips);
    }

    void hydrateAppState();
  }, []);

  if (!sessionHydrated || !recordingHydrated || !tripsHydrated || !waypointsHydrated) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#243224" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="recording" />
        <Stack.Screen name="trips" />
        <Stack.Screen name="settings" />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3efe6",
  },
});
