import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Image, Linking, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import { useThemeStore } from "../../state/theme-store";

const AUTHOR_EMAIL = "sc-trailbook@gmail.com";

function getAppName() {
  return Constants.expoConfig?.name ?? "Trailbook";
}

function getAppVersion() {
  return Constants.expoConfig?.version ?? "1.0.0";
}

export default function AboutScreen() {
  const router = useRouter();
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const resolvedThemeMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedThemeMode);

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
          <Text style={[styles.infoLabel, { color: theme.mutedText }]}>Author</Text>
          <Pressable
            onPress={() => {
              void Linking.openURL(`mailto:${AUTHOR_EMAIL}`);
            }}
            style={({ pressed }) => [styles.emailButton, pressed && styles.emailButtonPressed]}
          >
            <Text style={[styles.emailText, { color: theme.accent }]}>{AUTHOR_EMAIL}</Text>
          </Pressable>
        </View>
      </View>
    </ScreenLayout>
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
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
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
