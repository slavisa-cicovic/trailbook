import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getRecordingProfileLabel } from "../../constants/recording-profiles";
import { initialRecordingSession, setRecordingSession } from "../../state/recording-store";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { useTripsStore } from "../../state/trips-store";

export default function TripsScreen() {
  const identitySession = useSessionStore((state) => state.identitySession);
  const trips = useTripsStore((state) => state.trips);

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
      title="Trips"
    >
      <Text style={styles.subtitle}>Local trip records created by recording start/stop.</Text>

      {trips.length === 0 ? (
        <Text style={styles.empty}>No local trips yet.</Text>
      ) : (
        <View style={styles.list}>
          {trips.map((trip) => (
            <View key={trip.localId} style={styles.tripCard}>
              <Text style={styles.tripId}>{trip.title}</Text>
              {trip.description ? (
                <Text style={styles.tripDescription}>{trip.description}</Text>
              ) : null}
              <Text style={styles.tripMeta}>Local ID: {trip.localId}</Text>
              <Text style={styles.tripMeta}>User: {trip.userId}</Text>
              <Text style={styles.tripMeta}>Device: {trip.deviceId}</Text>
              <Text style={styles.tripMeta}>Mode: {getRecordingProfileLabel(trip.recordingProfile)}</Text>
              <Text style={styles.tripMeta}>Started: {trip.startedAt}</Text>
              <Text style={styles.tripMeta}>Ended: {trip.endedAt ?? "active"}</Text>
              <Text style={styles.tripMeta}>Sync: {trip.syncStatus}</Text>
            </View>
          ))}
        </View>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
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
  tripDescription: {
    fontSize: 14,
    color: "#384738",
    marginBottom: 2,
  },
});
