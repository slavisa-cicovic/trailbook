import { useState, type PropsWithChildren } from "react";
import { usePathname, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface ScreenLayoutProps extends PropsWithChildren {
  title?: string;
  accountEmail?: string | null;
  contentStyle?: StyleProp<ViewStyle>;
  contentVariant?: "card" | "plain";
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
  accountEmail,
  contentStyle,
  contentVariant = "card",
  onLogout,
  scrollEnabled = true,
  showBottomNavigation = false,
}: ScreenLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardContainer}
      >
        <View style={styles.shell}>
          {(title || onLogout) && (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{title ?? ""}</Text>
              {onLogout ? (
                <View style={styles.accountArea}>
                  <Pressable
                    onPress={() => setAccountMenuOpen((current) => !current)}
                    style={styles.accountButton}
                  >
                    <Text numberOfLines={1} style={styles.accountEmail}>
                      {accountEmail ?? "Account"}
                    </Text>
                    <Text style={styles.accountChevron}>
                      {accountMenuOpen ? "Close" : "Account"}
                    </Text>
                  </Pressable>

                  {accountMenuOpen ? (
                    <View style={styles.accountMenu}>
                      {accountEmail ? (
                        <Text numberOfLines={1} style={styles.accountMenuEmail}>
                          {accountEmail}
                        </Text>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          setAccountMenuOpen(false);
                          onLogout();
                        }}
                        style={styles.logoutButton}
                      >
                        <Text style={styles.logoutText}>Logout</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
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
              <View style={contentVariant === "card" ? styles.card : styles.plainContent}>
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
              <View style={contentVariant === "card" ? styles.card : styles.plainContent}>
                {children}
              </View>
            </View>
          )}

          {showBottomNavigation ? (
            <View style={styles.bottomNavigation}>
              {navigationItems.map((item) => {
                const active = pathname === item.href;

                return (
                  <Pressable
                    key={item.href}
                    onPress={() => router.replace(item.href)}
                    style={[styles.navItem, active && styles.navItemActive]}
                  >
                    <Text style={[styles.navText, active && styles.navTextActive]}>
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
    backgroundColor: "#f3efe6",
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
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2a1f",
  },
  accountArea: {
    position: "relative",
    alignItems: "flex-end",
    zIndex: 30,
  },
  accountButton: {
    maxWidth: 190,
    borderRadius: 18,
    backgroundColor: "#e4ebe0",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  accountEmail: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  accountChevron: {
    fontSize: 11,
    color: "#52624f",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  accountMenu: {
    position: "absolute",
    top: 54,
    right: 0,
    minWidth: 190,
    borderRadius: 16,
    backgroundColor: "#fffdf8",
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#dde6d8",
    shadowColor: "#243224",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    zIndex: 40,
  },
  accountMenuEmail: {
    fontSize: 13,
    color: "#52624f",
  },
  logoutButton: {
    borderRadius: 12,
    backgroundColor: "#243224",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f7f4ed",
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
    backgroundColor: "#fffdf8",
    padding: 24,
    gap: 8,
    zIndex: 1,
  },
  plainContent: {
    flex: 1,
  },
  bottomNavigation: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#dde6d8",
    backgroundColor: "#f3efe6",
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingVertical: 14,
    backgroundColor: "#e8eee4",
  },
  navItemActive: {
    backgroundColor: "#243224",
  },
  navText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#52624f",
  },
  navTextActive: {
    color: "#f7f4ed",
  },
});
