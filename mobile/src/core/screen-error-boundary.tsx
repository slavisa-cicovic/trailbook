import { useEffect } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { captureError } from "./sentry";

interface Props {
  error: Error;
  retry: () => void;
}

export function ScreenErrorBoundary({ error, retry }: Props) {
  const router = useRouter();

  useEffect(() => {
    captureError(error, { context: "screen-error-boundary" });
  }, [error]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      {__DEV__ && <Text style={styles.detail}>{error.message}</Text>}
      <View style={styles.actions}>
        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryLabel}>Go back</Text>
        </Pressable>
        <Pressable onPress={retry} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>Try again</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f1e5",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: {
    color: "#243224",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  detail: {
    color: "#52624f",
    fontSize: 13,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#e8e0cf",
    borderRadius: 10,
  },
  secondaryLabel: {
    color: "#243224",
    fontSize: 15,
    fontWeight: "500",
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#243224",
    borderRadius: 10,
  },
  primaryLabel: {
    color: "#f6f1e5",
    fontSize: 15,
    fontWeight: "500",
  },
});
