import { Redirect } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import PrimaryButton from "../../components/ui/primary-button";
import {
  closeActiveTrip,
  createRecordingSession,
  createTripForRecording,
  stopRecordingSession,
} from "../../services/recording/recording.service";
import { initialRecordingSession, setRecordingSession, useRecordingStore } from "../../state/recording-store";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { setTrips, useTripsStore } from "../../state/trips-store";

export default function RecordingScreen() {
  const identitySession = useSessionStore((state) => state.identitySession);
  const recordingSession = useRecordingStore((state) => state.session);
  const trips = useTripsStore((state) => state.trips);

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  const activeIdentitySession = identitySession;

  const status = recordingSession.isRecording ? "recording" : "idle";
  const lastPoint = recordingSession.lastPointRecordedAt ?? "n/a";

  async function handleStartRecording() {
    const startedAt = new Date().toISOString();
    const nextTrip = createTripForRecording(activeIdentitySession, startedAt);

    await setTrips([...trips, nextTrip]);
    await setRecordingSession(createRecordingSession(activeIdentitySession, startedAt));
  }

  async function handleStopRecording() {
    if (!recordingSession.activeTripId) {
      return;
    }

    const endedAt = new Date().toISOString();

    await setTrips(closeActiveTrip(trips, recordingSession.activeTripId, endedAt));
    await setRecordingSession(stopRecordingSession(recordingSession));
  }

  async function handleClearLocalSession() {
    await setActiveIdentitySession(null);
    await setRecordingSession(initialRecordingSession);
  }

  return (
    <ScreenLayout
      accountEmail={activeIdentitySession.userEmail}
      onLogout={() => void handleClearLocalSession()}
      showBottomNavigation
      title="Trailbook"
    >
      <Text style={styles.subtitle}>User and device bound recording scaffold.</Text>

      <Text style={styles.label}>Active user</Text>
      <Text style={styles.value}>{activeIdentitySession.userEmail}</Text>

      <Text style={styles.label}>Status</Text>
      <Text style={styles.value}>{status}</Text>

      <Text style={styles.label}>Active trip</Text>
      <Text style={styles.value}>{recordingSession.activeTripId ?? "n/a"}</Text>

      <Text style={styles.label}>Last point</Text>
      <Text style={styles.value}>{lastPoint}</Text>

      <Text style={styles.label}>Persisted trips</Text>
      <Text style={styles.value}>{String(trips.length)}</Text>

      <View style={styles.actions}>
        <PrimaryButton
          disabled={recordingSession.isRecording}
          onPress={() => void handleStartRecording()}
        >
          Start Recording
        </PrimaryButton>
        <PrimaryButton
          disabled={!recordingSession.isRecording}
          onPress={() => void handleStopRecording()}
          variant="secondary"
        >
          Stop Recording
        </PrimaryButton>
      </View>
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
  actions: {
    gap: 10,
    marginTop: 8,
  },
});
