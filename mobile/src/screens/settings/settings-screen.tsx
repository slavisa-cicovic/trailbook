import { useState } from "react";
import { Redirect } from "expo-router";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import ScreenLayout from "../../components/layout/screen-layout";
import { showDemoModeInfoDialog } from "../../services/demo/demo-mode.service";
import { logoutFromBackend } from "../../services/auth/mobile-auth.service";
import { restoreOwnedTripsFromServer } from "../../services/trips/trip-restore.service";
import { setTripPoints, useTripPointsStore } from "../../state/trip-points-store";
import { setTripSegments, useTripSegmentsStore } from "../../state/trip-segments-store";
import { clearSessionCredentials, setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { setThemeMode, useThemeStore } from "../../state/theme-store";
import { setWaypointAttachments, useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";

export default function SettingsScreen() {
  const identitySession = useSessionStore((state) => state.identitySession);
  const trips = useTripsStore((state) => state.trips);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const tripPoints = useTripPointsStore((state) => state.tripPoints);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const resolvedThemeMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedThemeMode);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  async function handleLogout() {
    if (identitySession?.sessionToken) {
      try {
        await logoutFromBackend(identitySession.sessionToken);
      } catch {
        // Local logout should still succeed if the backend session has already expired.
      }
    }

    await setActiveIdentitySession(null);
    clearSessionCredentials();
  }

  async function handleRestoreFromServer() {
    if (!identitySession || identitySession.mode !== "authenticated") {
      return;
    }

    setRestoreBusy(true);
    setRestoreMessage(null);

    try {
      const result = await restoreOwnedTripsFromServer(identitySession, {
        trips,
        tripSegments,
        tripPoints,
        waypoints,
        attachments: waypointAttachments,
      });

      await setTrips(result.nextTrips);
      await setTripSegments(result.nextTripSegments);
      await setTripPoints(result.nextTripPoints);
      await setWaypoints(result.nextWaypoints);
      await setWaypointAttachments(result.nextAttachments);

      setRestoreMessage(`Imported ${result.importedCount} trip(s), skipped ${result.skippedCount}.`);
    } catch (error) {
      setRestoreMessage(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setRestoreBusy(false);
    }
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenLayout
      accountEmail={identitySession.userEmail}
      accountMode={identitySession.mode}
      onLogout={() => void handleLogout()}
      showBottomNavigation
      title="Settings"
    >
      
      <Text style={[styles.label, { color: theme.mutedText }]}>Theme</Text>
      <View style={styles.themeRow}>
        <Pressable
          onPress={() => void setThemeMode("auto")}
          style={[
            styles.themeButton,
            { backgroundColor: theme.accentMuted },
            themeMode === "auto" && { backgroundColor: theme.accent },
          ]}
        >
          <Text
            style={[
              styles.themeButtonText,
              { color: theme.accent },
              themeMode === "auto" && { color: theme.surface },
            ]}
          >
            Auto
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void setThemeMode("day")}
          style={[
            styles.themeButton,
            { backgroundColor: theme.accentMuted },
            themeMode === "day" && { backgroundColor: theme.accent },
          ]}
        >
          <Text
            style={[
              styles.themeButtonText,
              { color: theme.accent },
              themeMode === "day" && { color: theme.surface },
            ]}
          >
            Day
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void setThemeMode("night")}
          style={[
            styles.themeButton,
            { backgroundColor: theme.accentMuted },
            themeMode === "night" && { backgroundColor: theme.accent },
          ]}
        >
          <Text
            style={[
              styles.themeButtonText,
              { color: theme.accent },
              themeMode === "night" && { color: theme.surface },
            ]}
          >
            Night
          </Text>
        </Pressable>
      </View>
      <Text style={[styles.themeHint, { color: theme.mutedText }]}>
        Active theme: {resolvedThemeMode === "night" ? "Night" : "Day"}
        {themeMode === "auto" ? " via system" : ""}
      </Text>

      <Text style={[styles.label, { color: theme.mutedText }]}>Active user</Text>
      <Text style={[styles.value, { color: theme.primaryText }]}>
        {identitySession.displayName || identitySession.userEmail}
      </Text>
      <Text style={[styles.themeHint, { color: theme.mutedText }]}>{identitySession.userEmail}</Text>
      <Text style={[styles.label, { color: theme.mutedText }]}>Session mode</Text>
      {identitySession.mode === "demo" ? (
        <Pressable onPress={showDemoModeInfoDialog} style={styles.modeButton}>
          <Text style={[styles.value, styles.modeButtonText, { color: theme.primaryText }]}>
            Demo Session Mode
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.value, { color: theme.primaryText }]}>Authenticated</Text>
      )}
      <Text style={[styles.label, { color: theme.mutedText }]}>Providers</Text>
      <Text style={[styles.value, { color: theme.primaryText }]}>
        {identitySession.providers.map((provider) => provider[0].toUpperCase() + provider.slice(1)).join(", ")}
      </Text>
      {identitySession.mode === "authenticated" ? (
        <>
          <Text style={[styles.label, { color: theme.mutedText }]}>Device transfer</Text>
          <Pressable
            onPress={() => void handleRestoreFromServer()}
            style={[styles.restoreButton, { backgroundColor: theme.accentMuted }]}
          >
            <Text style={[styles.restoreButtonText, { color: theme.accent }]}>
              {restoreBusy ? "Restoring..." : "Restore from server"}
            </Text>
          </Pressable>
          <Text style={[styles.themeHint, { color: theme.mutedText }]}>
            Imports server-backed trips that are not already present on this device.
          </Text>
          {restoreMessage ? (
            <Text
              style={[
                styles.restoreMessage,
                { color: restoreMessage.startsWith("Imported") ? theme.accent : "#9f2f2f" },
              ]}
            >
              {restoreMessage}
            </Text>
          ) : null}
        </>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 16,
    color: "#52624f",
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
  },
  value: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  modeButton: {
    alignSelf: "flex-start",
  },
  modeButtonText: {
    textDecorationLine: "underline",
  },
  themeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  themeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 12,
  },
  themeButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  themeHint: {
    fontSize: 13,
    marginBottom: 12,
  },
  restoreButton: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginBottom: 8,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  restoreMessage: {
    fontSize: 13,
    marginTop: 4,
  },
});
