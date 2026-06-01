import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Image, Linking, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import { getApiBaseUrl } from "../../services/api/mobile-api.service";
import { useSessionStore } from "../../state/session-store";
import { useThemeStore } from "../../state/theme-store";

const AUTHOR_EMAIL = "sc-trailbook@gmail.com";
const PRIVACY_STATUS = "To be published before public release";
const LICENSES_STATUS = "To be added before public release";

function getAppName() {
  return Constants.expoConfig?.name ?? "Trailbook";
}

function getAppVersion() {
  return Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "1.0.0";
}

function getBuildVersion() {
  return Constants.nativeBuildVersion ?? "Development";
}

function getRuntimeLabel() {
  if (Constants.appOwnership === "expo") {
    return "Expo Go";
  }

  return "Native build";
}

function formatPlatformVersion() {
  return `${Platform.OS} ${String(Platform.Version)}`;
}

function buildSupportEmailUrl(context: {
  apiBaseUrl: string;
  deviceId: string | null;
  role: string | null;
  sessionMode: string | null;
  userEmail: string | null;
}) {
  const subject = encodeURIComponent(`Trailbook support - ${getAppVersion()} (${formatPlatformVersion()})`);
  const body = encodeURIComponent(
    [
      "",
      "",
      "---",
      `App: ${getAppName()}`,
      `Version: ${getAppVersion()}`,
      `Build: ${getBuildVersion()}`,
      `Runtime: ${getRuntimeLabel()}`,
      `Platform: ${formatPlatformVersion()}`,
      `API: ${context.apiBaseUrl}`,
      `Account: ${context.userEmail ?? "not signed in"}`,
      `Mode: ${context.sessionMode ?? "n/a"}`,
      `Role: ${context.role ?? "n/a"}`,
      `Device ID: ${context.deviceId ?? "n/a"}`,
    ].join("\n"),
  );

  return `mailto:${AUTHOR_EMAIL}?subject=${subject}&body=${body}`;
}

export default function AboutScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);
  const deviceId = useSessionStore((state) => state.deviceId);
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const resolvedThemeMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedThemeMode);
  const isTestUser = identitySession?.mode === "authenticated" && identitySession.role === "test_user";
  const apiBaseUrl = getApiBaseUrl();

  function handleContactSupport() {
    void Linking.openURL(
      buildSupportEmailUrl({
        apiBaseUrl,
        deviceId,
        role: identitySession?.role ?? null,
        sessionMode: identitySession?.mode ?? null,
        userEmail: identitySession?.userEmail ?? null,
      }),
    );
  }

  return (
    <ScreenLayout
      contentVariant="plain"
      onBack={() => router.back()}
      showBottomNavigation
      title="About"
    >
      <View style={styles.root}>
        <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Image
            accessibilityIgnoresInvertColors
            source={require("../../../assets/app-icon.png")}
            style={styles.appIcon}
          />
          <Text style={[styles.appName, { color: theme.primaryText }]}>{getAppName()}</Text>
          <Text style={[styles.appVersion, { color: theme.mutedText }]}>Version {getAppVersion()}</Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.infoLabel, { color: theme.mutedText }]}>App info</Text>
          <InfoRow label="Build" theme={theme} value={getBuildVersion()} />
          <InfoRow label="Runtime" theme={theme} value={getRuntimeLabel()} />
          <InfoRow label="Platform" theme={theme} value={formatPlatformVersion()} />
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.infoLabel, { color: theme.mutedText }]}>Support</Text>
          <InfoRow label="Author" theme={theme} value={AUTHOR_EMAIL} />
          <Pressable
            onPress={handleContactSupport}
            style={({ pressed }) => [styles.emailButton, pressed && styles.emailButtonPressed]}
          >
            <Text style={[styles.emailText, { color: theme.accent }]}>Contact support</Text>
          </Pressable>
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.infoLabel, { color: theme.mutedText }]}>Permissions</Text>
          <Text style={[styles.bodyText, { color: theme.primaryText }]}>
            Trailbook uses location, motion activity and camera access for trip recording,
            auto mode detection and waypoint photos.
          </Text>
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.infoLabel, { color: theme.mutedText }]}>Legal</Text>
          <InfoRow label="Privacy policy" theme={theme} value={PRIVACY_STATUS} />
          <InfoRow label="Open-source licenses" theme={theme} value={LICENSES_STATUS} />
        </View>

        {isTestUser ? (
          <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.infoLabel, { color: theme.mutedText }]}>Debug</Text>
            <InfoRow label="API base URL" theme={theme} value={apiBaseUrl} />
            <InfoRow label="Account" theme={theme} value={identitySession.userEmail} />
            <InfoRow label="Role" theme={theme} value={identitySession.role} />
            <InfoRow label="Device ID" theme={theme} value={deviceId} />
          </View>
        ) : null}
      </View>
    </ScreenLayout>
  );
}

function InfoRow({
  label,
  theme,
  value,
}: {
  label: string;
  theme: ReturnType<typeof getAppTheme>;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoRowLabel, { color: theme.mutedText }]}>{label}</Text>
      <Text selectable style={[styles.infoRowValue, { color: theme.primaryText }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  heroCard: {
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 30,
  },
  appIcon: {
    borderRadius: 28,
    height: 112,
    marginBottom: 18,
    width: 112,
  },
  appName: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  appVersion: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 6,
  },
  infoCard: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  infoRow: {
    gap: 4,
  },
  infoRowLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  infoRowValue: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  bodyText: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  emailButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  emailButtonPressed: {
    opacity: 0.7,
  },
  emailText: {
    fontSize: 17,
    fontWeight: "800",
  },
});
