import { useCallback, useEffect, useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import {
  CONFIGURABLE_RECORDING_PROFILE_OPTIONS,
  RECORDING_PROFILE_OPTIONS,
} from "../../constants/recording-profiles";
import type {
  MobileRecordingConfig,
  PointFilterProfileConfig,
  RecordingConfigPlatform,
} from "../../domain/recording-config";
import type { RecordingProfile } from "../../domain/trips";
import {
  loadEditableRecordingConfig,
  saveLocalRecordingConfigOverride,
} from "../../services/recording/recording-config.service";
import { useSessionStore } from "../../state/session-store";
import { useThemeStore } from "../../state/theme-store";

const EMPTY_POINT_FILTER_PROFILE: PointFilterProfileConfig = {
  maxAccuracyMeters: 0,
  maxImpliedSpeedKmh: 0,
  maxJumpDistanceMeters: 0,
  minMovementMeters: 0,
};

interface ParsedTarget {
  mode: RecordingProfile;
  platform: Exclude<RecordingConfigPlatform, "default">;
}

function cloneConfig(config: MobileRecordingConfig): MobileRecordingConfig {
  return JSON.parse(JSON.stringify(config)) as MobileRecordingConfig;
}

function parseTarget(target: string | string[] | undefined): ParsedTarget | null {
  const value = Array.isArray(target) ? target[0] : target;

  if (!value) {
    return null;
  }

  const [platform, mode] = value.split("-");

  if ((platform !== "ios" && platform !== "android") || !isConfigurableRecordingProfile(mode)) {
    return null;
  }

  return { platform, mode };
}

function isConfigurableRecordingProfile(value: string | undefined): value is RecordingProfile {
  return CONFIGURABLE_RECORDING_PROFILE_OPTIONS.some((option) => option.value === value);
}

function getModeLabel(mode: RecordingProfile) {
  return RECORDING_PROFILE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

function getPlatformLabel(platform: Exclude<RecordingConfigPlatform, "default">) {
  return platform === "ios" ? "iOS" : "Android";
}

function toNumber(value: string, fieldName: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a non-negative number.`);
  }

  return parsed;
}

export default function RecordingConfigProfileScreen() {
  const router = useRouter();
  const { target } = useLocalSearchParams<{ target?: string }>();
  const parsedTarget = useMemo(() => parseTarget(target), [target]);
  const identitySession = useSessionStore((state) => state.identitySession);
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const theme = getAppTheme(resolveAppThemeMode(themeMode, systemColorScheme));
  const [config, setConfig] = useState<MobileRecordingConfig | null>(null);
  const [maxAccuracyMeters, setMaxAccuracyMeters] = useState("0");
  const [maxJumpDistanceMeters, setMaxJumpDistanceMeters] = useState("0");
  const [maxImpliedSpeedKmh, setMaxImpliedSpeedKmh] = useState("0");
  const [minMovementMeters, setMinMovementMeters] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!identitySession || identitySession.mode !== "authenticated" || !parsedTarget) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const record = await loadEditableRecordingConfig(identitySession);
    const nextConfig = record?.config ?? null;
    const pointFilterProfile =
      nextConfig?.pointFilters?.[parsedTarget.platform]?.[parsedTarget.mode] ??
      nextConfig?.pointFilters?.default?.[parsedTarget.mode] ??
      EMPTY_POINT_FILTER_PROFILE;

    setConfig(nextConfig);
    setMaxAccuracyMeters(String(pointFilterProfile.maxAccuracyMeters));
    setMaxJumpDistanceMeters(String(pointFilterProfile.maxJumpDistanceMeters));
    setMaxImpliedSpeedKmh(String(pointFilterProfile.maxImpliedSpeedKmh));
    setMinMovementMeters(String(pointFilterProfile.minMovementMeters));
    setLoading(false);
  }, [identitySession, parsedTarget]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void loadConfig(), 0);

    return () => clearTimeout(timeoutId);
  }, [loadConfig]);

  async function handleSave() {
    if (!identitySession || identitySession.mode !== "authenticated" || !parsedTarget || !config) {
      return;
    }

    setSaving(true);

    try {
      const nextConfig = cloneConfig(config);
      const pointFilterProfile: PointFilterProfileConfig = {
        maxAccuracyMeters: toNumber(maxAccuracyMeters, "Max accuracy"),
        maxJumpDistanceMeters: toNumber(maxJumpDistanceMeters, "Max jump distance"),
        maxImpliedSpeedKmh: toNumber(maxImpliedSpeedKmh, "Max implied speed"),
        minMovementMeters: toNumber(minMovementMeters, "Min movement"),
      };

      nextConfig.pointFilters = {
        ...(nextConfig.pointFilters ?? {}),
        [parsedTarget.platform]: {
          ...(nextConfig.pointFilters?.[parsedTarget.platform] ?? {}),
          [parsedTarget.mode]: pointFilterProfile,
        },
      };

      await saveLocalRecordingConfigOverride(identitySession, nextConfig);
      router.back();
    } catch (error) {
      Alert.alert("Recording config", error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetProfileToDefault() {
    if (!identitySession || identitySession.mode !== "authenticated" || !parsedTarget || !config) {
      return;
    }

    setResetting(true);

    try {
      const record = await loadEditableRecordingConfig(identitySession);
      const remoteConfig = record?.remoteConfig;
      const remotePointFilterProfile =
        remoteConfig?.pointFilters?.[parsedTarget.platform]?.[parsedTarget.mode] ??
        remoteConfig?.pointFilters?.default?.[parsedTarget.mode];

      if (!remoteConfig || !remotePointFilterProfile) {
        throw new Error("Server default is not available for this profile.");
      }

      const nextConfig = cloneConfig(config);
      nextConfig.pointFilters = {
        ...(nextConfig.pointFilters ?? {}),
        [parsedTarget.platform]: {
          ...(nextConfig.pointFilters?.[parsedTarget.platform] ?? {}),
          [parsedTarget.mode]: remotePointFilterProfile,
        },
      };

      await saveLocalRecordingConfigOverride(identitySession, nextConfig);
      setConfig(nextConfig);
      setMaxAccuracyMeters(String(remotePointFilterProfile.maxAccuracyMeters));
      setMaxJumpDistanceMeters(String(remotePointFilterProfile.maxJumpDistanceMeters));
      setMaxImpliedSpeedKmh(String(remotePointFilterProfile.maxImpliedSpeedKmh));
      setMinMovementMeters(String(remotePointFilterProfile.minMovementMeters));
    } catch (error) {
      Alert.alert("Recording config", error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setResetting(false);
    }
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (!parsedTarget) {
    return <Redirect href="/settings/recording-config" />;
  }

  return (
    <ScreenLayout
      contentVariant="plain"
      onBack={() => router.back()}
      title={`${getPlatformLabel(parsedTarget.platform)} ${getModeLabel(parsedTarget.mode)}`}
    >
      <View style={styles.root}>
        <View style={[styles.group, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.mutedText }]}>Point filters</Text>
          <Text style={[styles.description, { color: theme.mutedText }]}>
            Native background tracking stays on the AUTO baseline. These values only control how accepted points are filtered and segmented for this profile.
          </Text>
          <NumberField label="Max accuracy (m)" value={maxAccuracyMeters} onChange={setMaxAccuracyMeters} theme={theme} />
          <NumberField label="Max jump distance (m)" value={maxJumpDistanceMeters} onChange={setMaxJumpDistanceMeters} theme={theme} />
          <NumberField label="Max implied speed (km/h)" value={maxImpliedSpeedKmh} onChange={setMaxImpliedSpeedKmh} theme={theme} />
          <NumberField label="Min movement (m)" value={minMovementMeters} onChange={setMinMovementMeters} theme={theme} />
        </View>

        <View style={styles.actionRow}>
          <Pressable
            disabled={loading || saving || resetting || !config}
            onPress={() => void handleResetProfileToDefault()}
            style={[
              styles.secondaryButton,
              { backgroundColor: theme.accentMuted },
              (loading || saving || resetting || !config) && styles.disabled,
            ]}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.accent }]}>
              {resetting ? "Resetting..." : "Reset to default"}
            </Text>
          </Pressable>
          <Pressable
            disabled={loading || saving || resetting || !config}
            onPress={() => void handleSave()}
            style={[
              styles.saveButton,
              { backgroundColor: theme.accent },
              (loading || saving || resetting || !config) && styles.disabled,
            ]}
          >
            <Text style={[styles.saveButtonText, { color: theme.surface }]}>
              {saving ? "Saving..." : "Save local override"}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScreenLayout>
  );
}

function NumberField({
  label,
  onChange,
  theme,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  theme: ReturnType<typeof getAppTheme>;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.primaryText }]}>{label}</Text>
      <TextInput
        keyboardType="numeric"
        onChangeText={onChange}
        style={[
          styles.input,
          { backgroundColor: theme.surface, borderColor: theme.border, color: theme.primaryText },
        ]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 18,
  },
  group: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
  },
  field: {
    gap: 7,
  },
  input: {
    borderRadius: 13,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "800",
  },
  saveButton: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    paddingVertical: 14,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.55,
  },
});
