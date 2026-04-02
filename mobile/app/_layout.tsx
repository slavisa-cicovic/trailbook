import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { hydrateRecordingStore, useRecordingStore } from "../src/state/recording-store";
import { hydrateSessionStore, useSessionStore } from "../src/state/session-store";
import { hydrateTripsStore } from "../src/state/trips-store";

export default function RootLayout() {
  const sessionHydrated = useSessionStore((state) => state.hydrated);
  const recordingHydrated = useRecordingStore((state) => state.hydrated);

  useEffect(() => {
    void Promise.all([hydrateSessionStore(), hydrateRecordingStore(), hydrateTripsStore()]);
  }, []);

  if (!sessionHydrated || !recordingHydrated) {
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
