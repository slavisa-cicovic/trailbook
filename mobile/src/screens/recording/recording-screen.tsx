import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import MapView, { Marker, type Region } from "react-native-maps";

import ScreenLayout from "../../components/layout/screen-layout";
import RecordingControl from "../../components/recording/recording-control";
import {
  DEFAULT_RECORDING_PROFILE,
  getRecordingProfileLabel,
  RECORDING_PROFILE_OPTIONS,
} from "../../constants/recording-profiles";
import type { RecordingProfile } from "../../domain/trips";
import {
  getCurrentForegroundLocation,
  requestForegroundLocationAccess,
  type CurrentLocationSnapshot,
  watchForegroundLocation,
} from "../../services/location/location.service";
import {
  closeActiveTrip,
  continueInterruptedRecording,
  createRecordingSession,
  createTripForRecording,
  type RecordingDraftInput,
  stopRecordingSession,
  updateRecordingLastPoint,
  updateRecordingProfile,
  updateTripRecordingProfile,
} from "../../services/recording/recording.service";
import {
  createWaypointForTrip,
  type WaypointDraftInput,
} from "../../services/waypoints/waypoints.service";
import {
  initialRecordingSession,
  setRecordingSession,
  useRecordingStore,
} from "../../state/recording-store";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";

export default function RecordingScreen() {
  const identitySession = useSessionStore((state) => state.identitySession);
  const recordingSession = useRecordingStore((state) => state.session);
  const trips = useTripsStore((state) => state.trips);
  const waypoints = useWaypointsStore((state) => state.waypoints);

  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null);
  const [currentLocation, setCurrentLocation] = useState<CurrentLocationSnapshot | null>(null);
  const [startModalVisible, setStartModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [waypointModalVisible, setWaypointModalVisible] = useState(false);
  const [recordingDraft, setRecordingDraft] = useState<RecordingDraftInput>({
    title: "",
    description: "",
    recordingProfile: DEFAULT_RECORDING_PROFILE,
  });
  const [waypointDraft, setWaypointDraft] = useState<WaypointDraftInput>({
    title: "",
    note: "",
  });

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  const activeIdentitySession = identitySession;
  const activeTrip = trips.find((trip) => trip.localId === recordingSession.activeTripId) ?? null;
  const activeRecordingProfile = activeTrip?.recordingProfile ?? recordingSession.recordingProfile;
  const activeRecordingProfileLabel = getRecordingProfileLabel(activeRecordingProfile);
  const lastPoint = recordingSession.lastPointRecordedAt ?? "n/a";
  const activeTripCount = trips.filter((trip) => trip.endedAt === null).length;
  const recentWaypoints = activeTrip
    ? waypoints
        .filter((waypoint) => waypoint.tripLocalId === activeTrip.localId && waypoint.deletedAt === null)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 3)
    : [];
  const canChangeMode = recordingSession.activeTripId !== null;
  const canStartRecording = recordingDraft.title.trim().length > 0;
  const canSaveWaypoint = waypointDraft.title.trim().length > 0;

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

      stopWatchingLocation = await watchForegroundLocation(activeRecordingProfile, (nextLocation) => {
        setCurrentLocation(nextLocation);
      });
    }

    void hydrateLocation();

    return () => {
      active = false;
      stopWatchingLocation?.();
    };
  }, [activeRecordingProfile]);

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
    const nextTrip = createTripForRecording(activeIdentitySession, startedAt, recordingDraft);

    await setTrips([...trips, nextTrip]);
    await setRecordingSession(
      createRecordingSession(activeIdentitySession, startedAt, recordingDraft.recordingProfile),
    );
    setStartModalVisible(false);
    setRecordingDraft({
      title: "",
      description: "",
      recordingProfile: DEFAULT_RECORDING_PROFILE,
    });
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

  async function handleSelectRecordingProfile(profile: RecordingProfile) {
    if (!recordingSession.activeTripId) {
      setRecordingDraft((current) => ({
        ...current,
        recordingProfile: profile,
      }));
      setProfileModalVisible(false);
      return;
    }

    await setTrips(updateTripRecordingProfile(trips, recordingSession.activeTripId, profile));
    await setRecordingSession(updateRecordingProfile(recordingSession, profile));
    setProfileModalVisible(false);
  }

  async function handleSaveWaypoint() {
    if (!activeTrip) {
      Alert.alert("No active route", "Start recording before adding a note to the route.");
      return;
    }

    if (!currentLocation) {
      Alert.alert("Location not ready", "Wait for the current location to load before saving a note.");
      return;
    }

    const createdAt = new Date().toISOString();
    const nextWaypoint = createWaypointForTrip(activeTrip, currentLocation, waypointDraft, createdAt);

    await setWaypoints([...waypoints, nextWaypoint]);
    setWaypointModalVisible(false);
    setWaypointDraft({
      title: "",
      note: "",
    });
  }

  function handleRecordingControlPress() {
    if (recordingSession.status === "idle") {
      setStartModalVisible(true);
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
      <Modal
        animationType="fade"
        onRequestClose={() => setWaypointModalVisible(false)}
        transparent
        visible={waypointModalVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add note</Text>
              <Text style={styles.modalSubtitle}>
                Save a quick waypoint for this route using your current location.
              </Text>

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                autoCapitalize="sentences"
                onChangeText={(title) => setWaypointDraft((current) => ({ ...current, title }))}
                placeholder="Viewpoint"
                placeholderTextColor="#8c9a86"
                style={styles.fieldInput}
                value={waypointDraft.title}
              />

              <Text style={styles.fieldLabel}>Note</Text>
              <TextInput
                autoCapitalize="sentences"
                multiline
                numberOfLines={3}
                onChangeText={(note) => setWaypointDraft((current) => ({ ...current, note }))}
                placeholder="What do you want to remember here?"
                placeholderTextColor="#8c9a86"
                style={[styles.fieldInput, styles.fieldTextarea]}
                textAlignVertical="top"
                value={waypointDraft.note}
              />

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setWaypointModalVisible(false)}
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!canSaveWaypoint}
                  onPress={() => void handleSaveWaypoint()}
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    !canSaveWaypoint && styles.modalButtonDisabled,
                  ]}
                >
                  <Text style={styles.modalButtonPrimaryText}>Save note</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setProfileModalVisible(false)}
        transparent
        visible={profileModalVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Recording mode</Text>
              <Text style={styles.modalSubtitle}>
                Choose how often Trailbook should refresh location updates.
              </Text>

              <View style={styles.profileList}>
                {RECORDING_PROFILE_OPTIONS.map((option) => {
                  const selected = option.value === activeRecordingProfile;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => void handleSelectRecordingProfile(option.value)}
                      style={[styles.profileOption, selected && styles.profileOptionSelected]}
                    >
                      <View style={styles.profileOptionHeader}>
                        <Text
                          style={[
                            styles.profileOptionLabel,
                            selected && styles.profileOptionLabelSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={[
                            styles.profileOptionTag,
                            selected && styles.profileOptionTagSelected,
                          ]}
                        >
                          {option.description}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.profileOptionHint,
                          selected && styles.profileOptionHintSelected,
                        ]}
                      >
                        {option.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setProfileModalVisible(false)}
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                >
                  <Text style={styles.modalButtonSecondaryText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setStartModalVisible(false)}
        transparent
        visible={startModalVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Start recording</Text>
              <Text style={styles.modalSubtitle}>
                Give this route a name and choose the recording mode before the trip starts.
              </Text>

              <Text style={styles.fieldLabel}>Route name</Text>
              <TextInput
                autoCapitalize="sentences"
                onChangeText={(title) => setRecordingDraft((current) => ({ ...current, title }))}
                placeholder="Morning walk"
                placeholderTextColor="#8c9a86"
                style={styles.fieldInput}
                value={recordingDraft.title}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                autoCapitalize="sentences"
                multiline
                numberOfLines={3}
                onChangeText={(description) =>
                  setRecordingDraft((current) => ({ ...current, description }))
                }
                placeholder="Optional notes about the route"
                placeholderTextColor="#8c9a86"
                style={[styles.fieldInput, styles.fieldTextarea]}
                textAlignVertical="top"
                value={recordingDraft.description}
              />

              <Text style={styles.fieldLabel}>Recording mode</Text>
              <View style={styles.profileList}>
                {RECORDING_PROFILE_OPTIONS.map((option) => {
                  const selected = option.value === recordingDraft.recordingProfile;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() =>
                        setRecordingDraft((current) => ({
                          ...current,
                          recordingProfile: option.value,
                        }))
                      }
                      style={[styles.profileOption, selected && styles.profileOptionSelected]}
                    >
                      <View style={styles.profileOptionHeader}>
                        <Text
                          style={[
                            styles.profileOptionLabel,
                            selected && styles.profileOptionLabelSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={[
                            styles.profileOptionTag,
                            selected && styles.profileOptionTagSelected,
                          ]}
                        >
                          {option.description}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.profileOptionHint,
                          selected && styles.profileOptionHintSelected,
                        ]}
                      >
                        {option.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setStartModalVisible(false)}
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!canStartRecording}
                  onPress={() => void handleStartRecording()}
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    !canStartRecording && styles.modalButtonDisabled,
                  ]}
                >
                  <Text style={styles.modalButtonPrimaryText}>Start</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.mapShell}>
        {mapRegion && currentLocation ? (
          <MapView
            initialRegion={mapRegion}
            region={mapRegion}
            showsUserLocation={locationPermissionGranted === true}
            style={styles.map}
          >
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }}
              title="You are here"
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.placeholderTitle}>
              {locationPermissionGranted === false
                ? "Location permission is required"
                : "Locating you..."}
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
            <Text style={styles.statusLabel}>Route</Text>
            <Text style={styles.statusValue}>{activeTrip?.title ?? "none"}</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusLabel}>Mode</Text>
            <Text style={styles.statusValue}>{activeRecordingProfileLabel}</Text>
          </View>
        </View>

        <View style={styles.mapBottomOverlay}>
          <RecordingControl onPress={handleRecordingControlPress} status={recordingSession.status} />

          <View style={styles.metaPanel}>
            <Text style={styles.metaTitle}>Current session</Text>
            <Text style={styles.metaLine}>Active user: {activeIdentitySession.userEmail}</Text>
            <Text style={styles.metaLine}>Route: {activeTrip?.title ?? "n/a"}</Text>
            <Text style={styles.metaLine}>Mode: {activeRecordingProfileLabel}</Text>
            <Text style={styles.metaLine}>Last point: {lastPoint}</Text>
            <Text style={styles.metaLine}>Open trips: {String(activeTripCount)}</Text>
            <View style={styles.inlineActions}>
              {canChangeMode ? (
                <Pressable onPress={() => setProfileModalVisible(true)} style={styles.modeButton}>
                  <Text style={styles.modeButtonText}>Change mode</Text>
                </Pressable>
              ) : null}
              {activeTrip ? (
                <Pressable onPress={() => setWaypointModalVisible(true)} style={styles.noteButton}>
                  <Text style={styles.noteButtonText}>Add note</Text>
                </Pressable>
              ) : null}
            </View>
            {recordingSession.status === "interrupted" ? (
              <Text style={styles.metaWarning}>
                The previous recording was interrupted. Tap the control to continue or stop it.
              </Text>
            ) : null}
          </View>

          {activeTrip ? (
            <View style={styles.waypointsPanel}>
              <Text style={styles.metaTitle}>Recent waypoints</Text>
              {recentWaypoints.length === 0 ? (
                <Text style={styles.metaLine}>No saved notes on this route yet.</Text>
              ) : (
                recentWaypoints.map((waypoint) => (
                  <View key={waypoint.localId} style={styles.waypointCard}>
                    <Text style={styles.waypointTitle}>{waypoint.title}</Text>
                    {waypoint.note ? (
                      <Text numberOfLines={2} style={styles.waypointNote}>
                        {waypoint.note}
                      </Text>
                    ) : null}
                    <Text style={styles.waypointMeta}>
                      {new Date(waypoint.createdAt).toLocaleString()}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(20, 28, 20, 0.42)",
  },
  modalScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "#fffdf8",
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2a1f",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#52624f",
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#60705d",
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: "#d7ddcf",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#243224",
  },
  fieldTextarea: {
    minHeight: 90,
  },
  profileList: {
    gap: 8,
  },
  profileOption: {
    borderWidth: 1,
    borderColor: "#d7ddcf",
    borderRadius: 16,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  profileOptionSelected: {
    borderColor: "#243224",
    backgroundColor: "#edf4e9",
  },
  profileOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  profileOptionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  profileOptionLabelSelected: {
    color: "#1a261a",
  },
  profileOptionTag: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#60705d",
  },
  profileOptionTagSelected: {
    color: "#2d492d",
  },
  profileOptionHint: {
    fontSize: 13,
    color: "#52624f",
  },
  profileOptionHintSelected: {
    color: "#384738",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
  },
  modalButtonPrimary: {
    backgroundColor: "#243224",
  },
  modalButtonSecondary: {
    backgroundColor: "#e6ece1",
  },
  modalButtonPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fffdf8",
  },
  modalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#243224",
  },
  modalButtonDisabled: {
    opacity: 0.45,
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
    flexWrap: "wrap",
    gap: 10,
  },
  statusPill: {
    minWidth: 96,
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
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  modeButton: {
    borderRadius: 999,
    backgroundColor: "#243224",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  noteButton: {
    borderRadius: 999,
    backgroundColor: "#3c5a3c",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  metaWarning: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#b0661d",
  },
  waypointsPanel: {
    width: "100%",
    borderRadius: 20,
    backgroundColor: "rgba(255, 253, 248, 0.95)",
    padding: 16,
    gap: 10,
  },
  waypointCard: {
    borderRadius: 16,
    backgroundColor: "#eef3e7",
    padding: 12,
    gap: 4,
  },
  waypointTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  waypointNote: {
    fontSize: 13,
    color: "#455445",
  },
  waypointMeta: {
    fontSize: 12,
    color: "#60705d",
  },
});
