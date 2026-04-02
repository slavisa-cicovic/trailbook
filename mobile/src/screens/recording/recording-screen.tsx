import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import { Redirect } from "expo-router";

import RecordingControl from "../../components/recording/recording-control";
import ScreenLayout from "../../components/layout/screen-layout";
import {
  closeActiveTrip,
  continueInterruptedRecording,
  createRecordingSession,
  createTripForRecording,
  markRecordingInterrupted,
  stopRecordingSession,
  updateRecordingLastPoint,
} from "../../services/recording/recording.service";
import {
  getCurrentForegroundLocation,
  requestForegroundLocationAccess,
  type CurrentLocationSnapshot,
  watchForegroundLocation,
} from "../../services/location/location.service";
import {
  initialRecordingSession,
  setRecordingSession,
  useRecordingStore,
} from "../../state/recording-store";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { setTrips, useTripsStore } from "../../state/trips-store";

export default function RecordingScreen() {
  const identitySession = useSessionStore((state) => state.identitySession);
  const recordingSession = useRecordingStore((state) => state.session);
  const trips = useTripsStore((state) => state.trips);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null);
  const [currentLocation, setCurrentLocation] = useState<CurrentLocationSnapshot | null>(null);

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  const activeIdentitySession = identitySession;
  const mapLocation = currentLocation;

  const lastPoint = recordingSession.lastPointRecordedAt ?? "n/a";
  const activeTripCount = trips.filter((trip) => trip.endedAt === null).length;

  useEffect(() => {
    let active = true;
    let stopWatchingLocation: (() => void) | null = null;

    async function hydrateLocation() {
      const granted = await requestForegroundLocationAccess();

      if (!active) {
        return;
      }

      setLocationPermissionGranted(granted);

      if (!granted) {
        return;
      }

      const initialLocation = await getCurrentForegroundLocation();

      if (active && initialLocation) {
        setCurrentLocation(initialLocation);
      }

      stopWatchingLocation = await watchForegroundLocation((nextLocation) => {
        setCurrentLocation(nextLocation);
      });
    }

    void hydrateLocation();

    return () => {
      active = false;
      stopWatchingLocation?.();
    };
  }, []);

  useEffect(() => {
    if (!currentLocation || recordingSession.status !== "recording") {
      return;
    }

    if (recordingSession.lastPointRecordedAt === currentLocation.recordedAt) {
      return;
    }

    void setRecordingSession(updateRecordingLastPoint(recordingSession, currentLocation.recordedAt));
  }, [currentLocation, recordingSession]);

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

  async function handleContinueInterruptedRecording() {
    await setRecordingSession(continueInterruptedRecording(recordingSession));
  }

  async function handleClearLocalSession() {
    await setActiveIdentitySession(null);
    await setRecordingSession(initialRecordingSession);
  }

  function handleRecordingControlPress() {
    if (recordingSession.status === "idle") {
      void handleStartRecording();
      return;
    }

    if (recordingSession.status === "recording") {
      void handleStopRecording();
      return;
    }

    Alert.alert(
      "Interrupted recording",
      "This trip was not cleanly stopped. Do you want to continue it or stop it now?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Stop",
          style: "destructive",
          onPress: () => void handleStopRecording(),
        },
        {
          text: "Continue",
          onPress: () => void handleContinueInterruptedRecording(),
        },
      ],
    );
  }

  const mapRegion: Region | undefined = currentLocation
    ? {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : undefined;

  return (
    <ScreenLayout
      accountEmail={activeIdentitySession.userEmail}
      contentStyle={styles.screenContent}
      contentVariant="plain"
      onLogout={() => void handleClearLocalSession()}
      scrollEnabled={false}
      showBottomNavigation
      title="Trailbook"
    >
      <View style={styles.mapShell}>
        {mapRegion && mapLocation ? (
          <MapView
            initialRegion={mapRegion}
            region={mapRegion}
            showsUserLocation={locationPermissionGranted === true}
            style={styles.map}
          >
            <Marker
              coordinate={{
                latitude: mapLocation.latitude,
                longitude: mapLocation.longitude,
              }}
              title="You are here"
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.placeholderTitle}>
              {locationPermissionGranted === false ? "Location permission is required" : "Locating you..."}
            </Text>
            <Text style={styles.placeholderText}>
              {locationPermissionGranted === false
                ? "Allow foreground location access so the recording map can show where you are."
                : "The recording screen will center the map on your current position."}
            </Text>
          </View>
        )}

        <View style={styles.mapTopOverlay}>
          <View style={styles.statusPill}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={styles.statusValue}>{recordingSession.status}</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusLabel}>Trip</Text>
            <Text style={styles.statusValue}>{recordingSession.activeTripId ?? "none"}</Text>
          </View>
        </View>

        <View style={styles.mapBottomOverlay}>
          <RecordingControl onPress={handleRecordingControlPress} status={recordingSession.status} />

          <View style={styles.metaPanel}>
            <Text style={styles.metaTitle}>Current session</Text>
            <Text style={styles.metaLine}>Active user: {activeIdentitySession.userEmail}</Text>
            <Text style={styles.metaLine}>Last point: {lastPoint}</Text>
            <Text style={styles.metaLine}>Open trips: {String(activeTripCount)}</Text>
            {recordingSession.status === "interrupted" ? (
              <Text style={styles.metaWarning}>
                The previous recording was interrupted. Tap the control to continue or stop it.
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
  },
  mapShell: {
    flex: 1,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#dfe8db",
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#dfe8db",
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#243224",
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 15,
    color: "#52624f",
    textAlign: "center",
  },
  mapTopOverlay: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 10,
  },
  statusPill: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(255, 253, 248, 0.92)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#60705d",
  },
  statusValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  mapBottomOverlay: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    gap: 12,
    alignItems: "center",
  },
  metaPanel: {
    width: "100%",
    borderRadius: 20,
    backgroundColor: "rgba(255, 253, 248, 0.95)",
    padding: 16,
    gap: 6,
  },
  metaTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#243224",
  },
  metaLine: {
    fontSize: 14,
    color: "#52624f",
  },
  metaWarning: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#b0661d",
  },
});
