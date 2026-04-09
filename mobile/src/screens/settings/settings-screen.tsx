import { Redirect } from "expo-router";
import { Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import ScreenLayout from "../../components/layout/screen-layout";
import { logoutFromBackend } from "../../services/auth/mobile-auth.service";
import { clearSessionCredentials, setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { setThemeMode, useThemeStore } from "../../state/theme-store";

export default function SettingsScreen() {
  const identitySession = useSessionStore((state) => state.identitySession);
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const resolvedThemeMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedThemeMode);

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
      <Text style={[styles.subtitle, { color: theme.mutedText }]}>
        {identitySession.mode === "demo"
          ? "Demo mode stays local on this device and cannot sync or share routes."
          : "Authenticated account details for the current device session."}
      </Text>

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
      <Text style={[styles.value, { color: theme.primaryText }]}>
        {identitySession.mode === "demo" ? "Demo" : "Authenticated"}
      </Text>
      <Text style={[styles.label, { color: theme.mutedText }]}>Providers</Text>
      <Text style={[styles.value, { color: theme.primaryText }]}>
        {identitySession.providers.map((provider) => provider[0].toUpperCase() + provider.slice(1)).join(", ")}
      </Text>
      <Text style={[styles.label, { color: theme.mutedText }]}>Role</Text>
      <Text style={[styles.value, { color: theme.primaryText }]}>
        {identitySession.role[0].toUpperCase() + identitySession.role.slice(1)}
      </Text>
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
});
