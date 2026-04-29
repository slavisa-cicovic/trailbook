import { type ReactNode, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { MaterialIcons } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import { type AppThemePalette, getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import ScreenLayout from "../../components/layout/screen-layout";
import { showDemoModeInfoDialog } from "../../services/demo/demo-mode.service";
import { logoutFromBackend } from "../../services/auth/mobile-auth.service";
import { syncBackgroundLocationTracking } from "../../services/location/location.service";
import { syncResolvedRecordingConfig } from "../../services/recording/recording-config.service";
import { restoreOwnedTripsFromServer } from "../../services/trips/trip-restore.service";
import { useRecordingStore } from "../../state/recording-store";
import { setTripPoints, useTripPointsStore } from "../../state/trip-points-store";
import { setTripSegments, useTripSegmentsStore } from "../../state/trip-segments-store";
import { clearSessionCredentials, setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { setThemeMode, useThemeStore } from "../../state/theme-store";
import { setWaypointAttachments, useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import { exportDatabaseSnapshot } from "../../storage/sqlite/db";

type SettingsIconName = keyof typeof MaterialIcons.glyphMap;

interface SettingsSectionProps {
  children: ReactNode;
  theme: AppThemePalette;
  title: string;
}

interface SettingsRowProps {
  description?: string;
  disabled?: boolean;
  iconName: SettingsIconName;
  message?: string | null;
  messageTone?: "danger" | "success";
  onPress?: () => void;
  theme: AppThemePalette;
  title: string;
  value?: string;
}

function SettingsSection({ children, theme, title }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.mutedText }]}>{title}</Text>
      <View
        style={[
          styles.preferenceGroup,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function SettingsDivider({ theme }: { theme: AppThemePalette }) {
  return <View style={[styles.preferenceDivider, { backgroundColor: theme.border }]} />;
}

function SettingsRow({
  description,
  disabled,
  iconName,
  message,
  messageTone = "success",
  onPress,
  theme,
  title,
  value,
}: SettingsRowProps) {
  const isInteractive = Boolean(onPress) && !disabled;

  return (
    <>
      <Pressable
        disabled={!isInteractive}
        onPress={onPress}
        style={({ pressed }) => [
          styles.preferenceRow,
          pressed && styles.preferenceRowPressed,
          disabled && styles.preferenceRowDisabled,
        ]}
      >
        <View style={[styles.preferenceIcon, { backgroundColor: theme.accentMuted }]}>
          <MaterialIcons color={theme.accent} name={iconName} size={20} />
        </View>
        <View style={styles.preferenceBody}>
          <Text style={[styles.preferenceTitle, { color: theme.primaryText }]}>{title}</Text>
          {description ? (
            <Text style={[styles.preferenceDescription, { color: theme.mutedText }]}>
              {description}
            </Text>
          ) : null}
        </View>
        <View style={styles.preferenceTrailing}>
          {value ? (
            <Text style={[styles.preferenceValue, { color: theme.mutedText }]}>{value}</Text>
          ) : null}
          {isInteractive ? (
            <MaterialIcons color={theme.mutedText} name="chevron-right" size={22} />
          ) : null}
        </View>
      </Pressable>
      {message ? (
        <Text
          style={[
            styles.preferenceMessage,
            { color: messageTone === "success" ? theme.accent : theme.danger },
          ]}
        >
          {message}
        </Text>
      ) : null}
    </>
  );
}

function formatProvider(provider: string): string {
  return provider[0].toUpperCase() + provider.slice(1);
}

function getRecordingConfigErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Recording config update failed.";

  if (message.includes("UIBackgroundModes")) {
    return "This iOS build is missing background location support. Rebuild and reinstall Trailbook with UIBackgroundModes=location.";
  }

  return message;
}

export default function SettingsScreen() {
  const identitySession = useSessionStore((state) => state.identitySession);
  const router = useRouter();
  const trips = useTripsStore((state) => state.trips);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const tripPoints = useTripPointsStore((state) => state.tripPoints);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);
  const recordingStatus = useRecordingStore((state) => state.session.status);
  const activeRecordingTripId = useRecordingStore((state) => state.session.activeTripId);
  const activeRecordingProfile = useRecordingStore((state) => state.session.recordingProfile);
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const resolvedThemeMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedThemeMode);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [recordingConfigBusy, setRecordingConfigBusy] = useState(false);
  const [recordingConfigMessage, setRecordingConfigMessage] = useState<string | null>(null);
  const [exportDatabaseBusy, setExportDatabaseBusy] = useState(false);
  const [exportDatabaseMessage, setExportDatabaseMessage] = useState<string | null>(null);

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

  function handleConfirmLogout() {
    Alert.alert("Log out", "Do you want to log out of Trailbook on this device?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          void handleLogout();
        },
      },
    ]);
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

  async function handleUpdateRecordingConfig() {
    if (!identitySession || identitySession.mode !== "authenticated") {
      return;
    }

    setRecordingConfigBusy(true);
    setRecordingConfigMessage(null);

    try {
      await syncResolvedRecordingConfig(identitySession);
      await syncBackgroundLocationTracking(
        recordingStatus,
        activeRecordingTripId,
        activeRecordingProfile,
      );
      setRecordingConfigMessage("Recording config updated.");
    } catch (error) {
      setRecordingConfigMessage(getRecordingConfigErrorMessage(error));
    } finally {
      setRecordingConfigBusy(false);
    }
  }

  async function handleExportDatabase() {
    setExportDatabaseBusy(true);
    setExportDatabaseMessage(null);

    try {
      const exportUri = await exportDatabaseSnapshot();
      const sharingAvailable = await Sharing.isAvailableAsync();

      if (sharingAvailable) {
        await Sharing.shareAsync(exportUri, {
          dialogTitle: "Export Trailbook database",
          mimeType: "application/vnd.sqlite3",
          UTI: "public.database",
        });
      }

      setExportDatabaseMessage(`Database exported: ${exportUri.split("/").pop() ?? exportUri}`);
    } catch (error) {
      setExportDatabaseMessage(error instanceof Error ? error.message : "Database export failed.");
    } finally {
      setExportDatabaseBusy(false);
    }
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenLayout
      accountEmail={identitySession.userEmail}
      accountMode={identitySession.mode}
      onLogout={handleConfirmLogout}
      showBottomNavigation
      title="Settings"
    >
      <View style={styles.settingsRoot}>
        <SettingsSection theme={theme} title="Appearance">
          <View style={styles.themePreference}>
            <View style={[styles.preferenceIcon, { backgroundColor: theme.accentMuted }]}>
              <MaterialIcons color={theme.accent} name="palette" size={20} />
            </View>
            <View style={styles.preferenceBody}>
              <Text style={[styles.preferenceTitle, { color: theme.primaryText }]}>Theme</Text>
              <Text style={[styles.preferenceDescription, { color: theme.mutedText }]}>
                Active theme: {resolvedThemeMode === "night" ? "Night" : "Day"}
                {themeMode === "auto" ? " via system" : ""}
              </Text>
              <View style={styles.themeRow}>
                {(["auto", "day", "night"] as const).map((mode) => {
                  const isActive = themeMode === mode;

                  return (
                    <Pressable
                      key={mode}
                      onPress={() => void setThemeMode(mode)}
                      style={[
                        styles.themeButton,
                        { backgroundColor: theme.accentMuted },
                        isActive && { backgroundColor: theme.accent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.themeButtonText,
                          { color: theme.accent },
                          isActive && { color: theme.surface },
                        ]}
                      >
                        {mode === "auto" ? "Auto" : mode === "day" ? "Day" : "Night"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        </SettingsSection>

        <SettingsSection theme={theme} title="Account">
          <SettingsRow
            description={identitySession.userEmail}
            iconName="person"
            theme={theme}
            title="Active user"
            value={identitySession.displayName || identitySession.userEmail}
          />
          <SettingsDivider theme={theme} />
          <SettingsRow
            description={
              identitySession.mode === "demo"
                ? "Local demo data. Tap for details."
                : "Backend session is active."
            }
            iconName={identitySession.mode === "demo" ? "info-outline" : "verified-user"}
            onPress={identitySession.mode === "demo" ? showDemoModeInfoDialog : undefined}
            theme={theme}
            title="Session mode"
            value={identitySession.mode === "demo" ? "Demo" : "Authenticated"}
          />
          <SettingsDivider theme={theme} />
          <SettingsRow
            description="Login providers linked to this session."
            iconName="link"
            theme={theme}
            title="Providers"
            value={identitySession.providers.map(formatProvider).join(", ")}
          />
        </SettingsSection>

        {identitySession.mode === "authenticated" ? (
          <SettingsSection theme={theme} title="Recording">
            <SettingsRow
              description="Pulls the latest resolved recording profile config from the server and applies it immediately."
              disabled={recordingConfigBusy}
              iconName="tune"
              message={recordingConfigMessage}
              messageTone={recordingConfigMessage === "Recording config updated." ? "success" : "danger"}
              onPress={() => void handleUpdateRecordingConfig()}
              theme={theme}
              title="Recording config"
              value={recordingConfigBusy ? "Updating..." : "Update"}
            />
            <SettingsDivider theme={theme} />
            <SettingsRow
              description="Edit the local recording config used by this device."
              iconName="settings"
              onPress={() => router.push("/settings/recording-config")}
              theme={theme}
              title="Recording config editor"
              value="Open"
            />
          </SettingsSection>
        ) : null}

        {identitySession.mode === "authenticated" ? (
          <SettingsSection theme={theme} title="Data transfer">
            <SettingsRow
              description="Imports server-backed trips that are not already present on this device."
              disabled={restoreBusy}
              iconName="cloud-download"
              message={restoreMessage}
              messageTone={restoreMessage?.startsWith("Imported") ? "success" : "danger"}
              onPress={() => void handleRestoreFromServer()}
              theme={theme}
              title="Restore from server"
              value={restoreBusy ? "Restoring..." : "Restore"}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection theme={theme} title="Debug">
          <SettingsRow
            description="Temporary helper that exports the local SQLite database snapshot."
            disabled={exportDatabaseBusy}
            iconName="storage"
            message={exportDatabaseMessage}
            messageTone={exportDatabaseMessage?.startsWith("Database exported:") ? "success" : "danger"}
            onPress={() => void handleExportDatabase()}
            theme={theme}
            title="Export database"
            value={exportDatabaseBusy ? "Exporting..." : "Export"}
          />
        </SettingsSection>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  settingsRoot: {
    gap: 18,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginLeft: 4,
    textTransform: "uppercase",
  },
  preferenceGroup: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
  },
  preferenceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  preferenceRowPressed: {
    opacity: 0.72,
  },
  preferenceRowDisabled: {
    opacity: 0.62,
  },
  preferenceIcon: {
    alignItems: "center",
    borderRadius: 13,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  preferenceBody: {
    flex: 1,
    gap: 3,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  preferenceDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  preferenceTrailing: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 2,
  },
  preferenceValue: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    maxWidth: 130,
    textAlign: "right",
  },
  preferenceDivider: {
    height: 1,
    marginLeft: 62,
  },
  preferenceMessage: {
    fontSize: 13,
    lineHeight: 18,
    paddingBottom: 12,
    paddingHorizontal: 14,
    paddingLeft: 62,
  },
  themePreference: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  themeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 9,
  },
  themeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 10,
  },
  themeButtonText: {
    fontSize: 13,
    fontWeight: "800",
  },
});
