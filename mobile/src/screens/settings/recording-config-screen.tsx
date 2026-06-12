import { useCallback, useState } from "react";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Alert, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import {
  CONFIGURABLE_RECORDING_PROFILE_OPTIONS,
  RECORDING_PROFILE_OPTIONS,
} from "../../constants/recording-profiles";
import type { CachedMobileRecordingConfig, MobileRecordingConfig, RecordingConfigPlatform } from "../../domain/recording-config";
import type { RecordingProfile } from "../../domain/trips";
import {
  loadEditableRecordingConfig,
  resetRecordingConfigToServerDefaults,
} from "../../services/recording/recording-config.service";
import { useSessionStore } from "../../state/session-store";
import { useThemeStore } from "../../state/theme-store";

const EDITABLE_PLATFORM: Exclude<RecordingConfigPlatform, "default"> = Platform.OS === "ios" ? "ios" : "android";
const EDITABLE_MODES: RecordingProfile[] = CONFIGURABLE_RECORDING_PROFILE_OPTIONS.map((option) => option.value);

function formatMode(mode: RecordingProfile) {
  return RECORDING_PROFILE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

function formatPlatform(platform: Exclude<RecordingConfigPlatform, "default">) {
  return platform === "ios" ? "iOS" : "Android";
}

function describeProfile(config: MobileRecordingConfig, platform: Exclude<RecordingConfigPlatform, "default">, mode: RecordingProfile) {
  const pointFilter = config.pointFilters?.[platform]?.[mode] ?? config.pointFilters?.default?.[mode];

  if (!pointFilter) {
    return "Not configured";
  }

  return `Filters: ${pointFilter.minMovementMeters}m min, ${pointFilter.maxJumpDistanceMeters}m jump, ${pointFilter.maxImpliedSpeedKmh}km/h`;
}

export default function RecordingConfigScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const theme = getAppTheme(resolveAppThemeMode(themeMode, systemColorScheme));
  const [record, setRecord] = useState<CachedMobileRecordingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetBusy, setResetBusy] = useState(false);

  const reloadConfig = useCallback(async () => {
    if (!identitySession || identitySession.mode !== "authenticated") {
      setRecord(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setRecord(await loadEditableRecordingConfig(identitySession));
    setLoading(false);
  }, [identitySession]);

  useFocusEffect(useCallback(() => {
    void reloadConfig();
  }, [reloadConfig]));

  async function handleReset() {
    if (!identitySession || identitySession.mode !== "authenticated") {
      return;
    }

    setResetBusy(true);

    try {
      await resetRecordingConfigToServerDefaults(identitySession);
      await reloadConfig();
      Alert.alert("Recording config", "Recording config reset to server defaults.");
    } catch (error) {
      Alert.alert("Recording config", error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setResetBusy(false);
    }
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  const config = record?.config;

  return (
    <ScreenLayout
      onBack={() => router.back()}
      showBottomNavigation
      title="Recording config"
      contentVariant="plain"
    >
      <View style={styles.root}>
        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.primaryText }]}>Local device override</Text>
          <Text style={[styles.description, { color: theme.mutedText }]}>
            AUTO recording keeps native background tracking stable. These overrides tune point filtering and segment classification on this device. Reset restores the config returned by the server database.
          </Text>
          <Pressable
            disabled={resetBusy || loading}
            onPress={() => void handleReset()}
            style={[styles.resetButton, { backgroundColor: theme.accentMuted }, (resetBusy || loading) && styles.disabled]}
          >
            <MaterialIcons color={theme.accent} name="restart-alt" size={18} />
            <Text style={[styles.resetButtonText, { color: theme.accent }]}>
              {resetBusy ? "Resetting..." : "Reset to server values"}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <Text style={[styles.loadingText, { color: theme.mutedText }]}>Loading recording config...</Text>
        ) : null}

        {config ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.mutedText }]}>
              {formatPlatform(EDITABLE_PLATFORM)}
            </Text>
            <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {EDITABLE_MODES.map((mode, index) => (
                <View key={`${EDITABLE_PLATFORM}-${mode}`}>
                  <Pressable
                    onPress={() => router.push(`/settings/recording-config/${EDITABLE_PLATFORM}-${mode}`)}
                    style={styles.row}
                  >
                    <View style={[styles.icon, { backgroundColor: theme.accentMuted }]}>
                      <MaterialIcons color={theme.accent} name="filter-alt" size={18} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: theme.primaryText }]}>{formatMode(mode)}</Text>
                      <Text style={[styles.rowDescription, { color: theme.mutedText }]}>
                        {describeProfile(config, EDITABLE_PLATFORM, mode)}
                      </Text>
                    </View>
                    <MaterialIcons color={theme.mutedText} name="chevron-right" size={22} />
                  </Pressable>
                  {index < EDITABLE_MODES.length - 1 ? (
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 18,
  },
  infoCard: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
  },
  resetButton: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingVertical: 12,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.6,
  },
  loadingText: {
    fontSize: 14,
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
  group: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  icon: {
    alignItems: "center",
    borderRadius: 12,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: "800",
  },
  rowDescription: {
    fontSize: 13,
  },
  divider: {
    height: 1,
    marginLeft: 60,
  },
});
