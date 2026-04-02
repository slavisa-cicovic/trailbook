import { Redirect } from "expo-router";
import { StyleSheet, Text } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { initialRecordingSession, setRecordingSession } from "../../state/recording-store";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";

export default function SettingsScreen() {
  const identitySession = useSessionStore((state) => state.identitySession);

  async function handleLogout() {
    await setActiveIdentitySession(null);
    await setRecordingSession(initialRecordingSession);
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenLayout
      accountEmail={identitySession.userEmail}
      onLogout={() => void handleLogout()}
      showBottomNavigation
      title="Settings"
    >
      <Text style={styles.subtitle}>Temporary local session details for the current device.</Text>

      <Text style={styles.label}>Active user</Text>
      <Text style={styles.value}>{identitySession.userEmail}</Text>
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
    color: "#7b8a75",
  },
  value: {
    fontSize: 18,
    fontWeight: "600",
    color: "#243224",
    marginBottom: 8,
  },
});
