import { type PropsWithChildren } from "react";
import { usePathname, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import { useThemeStore } from "../../state/theme-store";

interface ScreenLayoutProps extends PropsWithChildren {
  title?: string;
  accountEmail?: string | null;
  accountMode?: "demo" | "authenticated" | null;
  contentStyle?: StyleProp<ViewStyle>;
  contentVariant?: "card" | "plain";
  onBack?: () => void;
  onLogout?: () => void;
  scrollEnabled?: boolean;
  showBottomNavigation?: boolean;
}

const navigationItems = [
  { href: "/recording", label: "Record" },
  { href: "/trips", label: "Trips" },
  { href: "/settings", label: "Settings" },
] as const;

export default function ScreenLayout({
  children,
  title,
  contentStyle,
  contentVariant = "card",
  onBack,
  onLogout,
  scrollEnabled = true,
  showBottomNavigation = false,
}: ScreenLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const resolvedThemeMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedThemeMode);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardContainer}
      >
        <View style={styles.shell}>
          {(title || onLogout) && (
            <View style={styles.header}>
              <View style={styles.headerLead}>
                {onBack ? (
                  <Pressable
                    onPress={onBack}
                    style={[styles.backButton, { backgroundColor: theme.accentMuted }]}
                  >
                    <MaterialIcons color={theme.accent} name="arrow-back" size={18} />
                  </Pressable>
                ) : null}
                <Text style={[styles.headerTitle, { color: theme.primaryText }]}>{title ?? ""}</Text>
              </View>
              {onLogout ? (
                <Pressable
                  accessibilityLabel="Logout"
                  onPress={onLogout}
                  style={[styles.logoutIconButton, { backgroundColor: theme.accentMuted }]}
                >
                  <MaterialIcons color={theme.accent} name="logout" size={20} />
                </Pressable>
              ) : (
                <View style={styles.headerSpacer} />
              )}
            </View>
          )}

          {scrollEnabled ? (
            <ScrollView
              contentContainerStyle={[
                styles.content,
                contentVariant === "plain" && styles.contentPlain,
                contentStyle,
              ]}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={[
                  contentVariant === "card"
                    ? styles.card
                    : scrollEnabled
                      ? styles.plainContentScroll
                      : styles.plainContent,
                  contentVariant === "card" ? { backgroundColor: theme.card } : null,
                ]}
              >
                {children}
              </View>
            </ScrollView>
          ) : (
            <View
              style={[
                styles.content,
                styles.contentNoScroll,
                contentVariant === "plain" && styles.contentPlain,
                contentStyle,
              ]}
            >
              <View
                style={[
                  contentVariant === "card" ? styles.card : styles.plainContent,
                  contentVariant === "card" ? { backgroundColor: theme.card } : null,
                ]}
              >
                {children}
              </View>
            </View>
          )}

          {showBottomNavigation ? (
            <View
              style={[
                styles.bottomNavigation,
                { backgroundColor: theme.background, borderTopColor: theme.border },
              ]}
            >
              {navigationItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Pressable
                    key={item.href}
                    onPress={() => router.replace(item.href)}
                    style={[
                      styles.navItem,
                      { backgroundColor: theme.accentMuted },
                      active && { backgroundColor: theme.navActiveBackground },
                    ]}
                  >
                    <Text
                      style={[
                        styles.navText,
                        { color: theme.navText },
                        active && { color: resolvedThemeMode === "night" ? "#132014" : "#f7f4ed" },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  shell: {
    flex: 1,
  },
  header: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    zIndex: 20,
    elevation: 20,
  },
  headerLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
  },
  backButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  logoutIconButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  headerSpacer: {
    width: 72,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    zIndex: 1,
  },
  contentNoScroll: {
    flex: 1,
  },
  contentPlain: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 24,
    padding: 24,
    gap: 8,
    zIndex: 1,
  },
  plainContent: {
    flex: 1,
  },
  plainContentScroll: {
    width: "100%",
  },
  bottomNavigation: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 14,
  },
  navText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
