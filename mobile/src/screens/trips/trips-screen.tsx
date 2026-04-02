import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import PrimaryButton from "../../components/ui/primary-button";
import { useTripsStore } from "../../state/trips-store";

export default function TripsScreen() {
  const router = useRouter();
  const trips = useTripsStore((state) => state.trips);

  return (
    <ScreenLayout>
      <Text style={styles.title}>Trips</Text>
      <Text style={styles.subtitle}>Local trip records created by recording start/stop.</Text>

      {trips.length === 0 ? (
        <Text style={styles.empty}>No local trips yet.</Text>
      ) : (
        <View style={styles.list}>
          {trips.map((trip) => (
            <View key={trip.localId} style={styles.tripCard}>
              <Text style={styles.tripId}>{trip.localId}</Text>
              <Text style={styles.tripMeta}>User: {trip.userId}</Text>
              <Text style={styles.tripMeta}>Device: {trip.deviceId}</Text>
              <Text style={styles.tripMeta}>Started: {trip.startedAt}</Text>
              <Text style={styles.tripMeta}>Ended: {trip.endedAt ?? "active"}</Text>
              <Text style={styles.tripMeta}>Sync: {trip.syncStatus}</Text>
            </View>
          ))}
        </View>
      )}

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
  empty: {
    fontSize: 16,
    color: "#52624f",
    marginBottom: 12,
  },
  list: {
    gap: 12,
    marginBottom: 12,
  },
  tripCard: {
    borderRadius: 16,
    backgroundColor: "#f5f1e7",
    padding: 16,
    gap: 4,
  },
  tripId: {
    fontSize: 16,
    fontWeight: "700",
    color: "#243224",
  },
  tripMeta: {
    fontSize: 13,
    color: "#52624f",
  },
});
