import { useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import PrimaryButton from "../../components/ui/primary-button";
import { useSessionStore } from "../../state/session-store";

export default function SettingsScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);

  return (
    <ScreenLayout>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Temporary local session details for the current device.</Text>

      <Text style={styles.label}>Active user</Text>
      <Text style={styles.value}>{identitySession?.userEmail ?? "n/a"}</Text>

      <PrimaryButton onPress={() => router.replace("/recording")} variant="ghost">
        Back to Recording
      </PrimaryButton>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1f2a1f",
  },
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
