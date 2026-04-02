import { useEffect, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getRecordingProfileLabel } from "../../constants/recording-profiles";
import type { Trip, Waypoint } from "../../domain/trips";
import {
  buildTripSummary,
  getVisibleAttachmentsForWaypoints,
  getVisibleTrips,
  getVisibleWaypointsForTrip,
  markTripDeleted,
  markWaypointAttachmentDeleted,
  restoreTripDeletedState,
  updateTripMetadata,
  updateWaypointMetadata,
  type TripUpdateInput,
  type WaypointUpdateInput,
} from "../../services/trips/trips-management.service";
import { setRecordingSession } from "../../state/recording-store";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { setWaypointAttachments, useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";

interface PendingUndoState {
  tripLocalId: string;
  tripTitle: string;
}

export default function TripsScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);
  const trips = useTripsStore((state) => state.trips);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [pendingUndo, setPendingUndo] = useState<PendingUndoState | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripEditVisible, setTripEditVisible] = useState(false);
  const [tripDetailsVisible, setTripDetailsVisible] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null);
  const [waypointEditVisible, setWaypointEditVisible] = useState(false);
  const [tripDraft, setTripDraft] = useState<TripUpdateInput>({
    title: "",
    description: "",
  });
  const [waypointDraft, setWaypointDraft] = useState<WaypointUpdateInput>({
    title: "",
    note: "",
  });

  const visibleTrips = getVisibleTrips(trips);
  const tripSummaries = visibleTrips.map((trip) => buildTripSummary(trip, waypoints, waypointAttachments));
  const selectedTrip = visibleTrips.find((trip) => trip.localId === selectedTripId) ?? null;
  const selectedTripWaypoints = selectedTrip
    ? getVisibleWaypointsForTrip(waypoints, selectedTrip.localId)
    : [];
  const selectedTripAttachments = selectedTrip
    ? getVisibleAttachmentsForWaypoints(
        waypointAttachments,
        selectedTripWaypoints.map((waypoint) => waypoint.localId),
      )
    : [];
  const selectedWaypoint = selectedTripWaypoints.find((waypoint) => waypoint.localId === selectedWaypointId) ?? null;

  useEffect(() => {
    if (!pendingUndo) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setPendingUndo(null);
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [pendingUndo]);

  async function handleLogout() {
    await setActiveIdentitySession(null);
  }

  async function handleDeleteTrip(trip: Trip) {
    if (trip.endedAt === null) {
      Alert.alert("Active trip", "Stop the active route before deleting it.");
      return;
    }

    const deletedAt = new Date().toISOString();
    const nextState = markTripDeleted(trips, waypoints, waypointAttachments, trip.localId, deletedAt);

    await setTrips(nextState.trips);
    await setWaypoints(nextState.waypoints);
    await setWaypointAttachments(nextState.attachments);
    setPendingUndo({
      tripLocalId: trip.localId,
      tripTitle: trip.title,
    });
    if (selectedTripId === trip.localId) {
      setTripDetailsVisible(false);
      setSelectedTripId(null);
    }
  }

  async function handleUndoDelete() {
    if (!pendingUndo) {
      return;
    }

    const restoredAt = new Date().toISOString();
    const nextState = restoreTripDeletedState(
      trips,
      waypoints,
      waypointAttachments,
      pendingUndo.tripLocalId,
      restoredAt,
    );

    await setTrips(nextState.trips);
    await setWaypoints(nextState.waypoints);
    await setWaypointAttachments(nextState.attachments);
    setPendingUndo(null);
  }

  function openTripEdit(trip: Trip) {
    setSelectedTripId(trip.localId);
    setTripDraft({
      title: trip.title,
      description: trip.description ?? "",
    });
    setTripEditVisible(true);
  }

  async function handleSaveTripEdit() {
    if (!selectedTrip || tripDraft.title.trim().length === 0) {
      return;
    }

    await setTrips(updateTripMetadata(trips, selectedTrip.localId, tripDraft, new Date().toISOString()));
    setTripEditVisible(false);
  }

  function openTripDetails(trip: Trip) {
    setSelectedTripId(trip.localId);
    setTripDetailsVisible(true);
  }

  function openWaypointEdit(waypoint: Waypoint) {
    setSelectedWaypointId(waypoint.localId);
    setWaypointDraft({
      title: waypoint.title,
      note: waypoint.note ?? "",
    });
    setWaypointEditVisible(true);
  }

  async function handleSaveWaypointEdit() {
    if (!selectedWaypoint || waypointDraft.title.trim().length === 0) {
      return;
    }

    await setWaypoints(
      updateWaypointMetadata(waypoints, selectedWaypoint.localId, waypointDraft, new Date().toISOString()),
    );
    setWaypointEditVisible(false);
  }

  async function handleRemovePhoto(attachmentLocalId: string) {
    await setWaypointAttachments(
      markWaypointAttachmentDeleted(waypointAttachments, attachmentLocalId, new Date().toISOString()),
    );
  }

  async function handleResumeTrip(trip: Trip) {
    if (!identitySession) {
      return;
    }

    await setRecordingSession({
      status: "interrupted",
      activeTripId: trip.localId,
      startedAt: trip.startedAt,
      lastPointRecordedAt: null,
      interruptedAt: new Date().toISOString(),
      userId: trip.userId,
      userEmail: identitySession.userEmail,
      deviceId: trip.deviceId,
      recordingProfile: trip.recordingProfile,
    });

    router.replace("/recording");
  }

  function getAttachmentsForWaypoint(waypointLocalId: string) {
    return selectedTripAttachments.filter(
      (attachment) => attachment.waypointLocalId === waypointLocalId && attachment.deletedAt === null,
    );
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenLayout
      accountEmail={identitySession.userEmail}
      contentVariant="plain"
      onLogout={() => void handleLogout()}
      showBottomNavigation
      title="Trips"
    >
      <Modal
        animationType="slide"
        onRequestClose={() => setTripEditVisible(false)}
        visible={tripEditVisible}
      >
        <View style={styles.modalScreen}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit trip</Text>

            <Text style={styles.fieldLabel}>Trip name</Text>
            <TextInput
              onChangeText={(title) => setTripDraft((current) => ({ ...current, title }))}
              placeholder="Trip name"
              placeholderTextColor="#8c9a86"
              style={styles.fieldInput}
              value={tripDraft.title}
            />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              multiline
              numberOfLines={4}
              onChangeText={(description) => setTripDraft((current) => ({ ...current, description }))}
              placeholder="Trip description"
              placeholderTextColor="#8c9a86"
              style={[styles.fieldInput, styles.fieldTextarea]}
              textAlignVertical="top"
              value={tripDraft.description}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setTripEditVisible(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={tripDraft.title.trim().length === 0}
                onPress={() => void handleSaveTripEdit()}
                style={[
                  styles.primaryButton,
                  tripDraft.title.trim().length === 0 && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setWaypointEditVisible(false)}
        visible={waypointEditVisible}
      >
        <View style={styles.modalScreen}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit note</Text>

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              onChangeText={(title) => setWaypointDraft((current) => ({ ...current, title }))}
              placeholder="Waypoint title"
              placeholderTextColor="#8c9a86"
              style={styles.fieldInput}
              value={waypointDraft.title}
            />

            <Text style={styles.fieldLabel}>Note</Text>
            <TextInput
              multiline
              numberOfLines={4}
              onChangeText={(note) => setWaypointDraft((current) => ({ ...current, note }))}
              placeholder="Waypoint note"
              placeholderTextColor="#8c9a86"
              style={[styles.fieldInput, styles.fieldTextarea]}
              textAlignVertical="top"
              value={waypointDraft.note}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setWaypointEditVisible(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={waypointDraft.title.trim().length === 0}
                onPress={() => void handleSaveWaypointEdit()}
                style={[
                  styles.primaryButton,
                  waypointDraft.title.trim().length === 0 && styles.disabledButton,
                ]}
              >
                <Text style={styles.primaryButtonText}>Save</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => setTripDetailsVisible(false)}
        visible={tripDetailsVisible}
      >
        <View style={styles.modalScreen}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            {selectedTrip ? (
              <>
                <View style={styles.detailsHeader}>
                  <View style={styles.detailsHeaderText}>
                    <Text style={styles.modalTitle}>{selectedTrip.title}</Text>
                    {selectedTrip.description ? (
                      <Text style={styles.detailsDescription}>{selectedTrip.description}</Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={() => {
                      setTripDetailsVisible(false);
                      openTripEdit(selectedTrip);
                    }}
                    style={styles.editChip}
                  >
                    <Text style={styles.editChipText}>Edit trip</Text>
                  </Pressable>
                </View>

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryKey}>Mode</Text>
                    <Text style={styles.summaryValue}>
                      {getRecordingProfileLabel(selectedTrip.recordingProfile)}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryKey}>Waypoints</Text>
                    <Text style={styles.summaryValue}>{String(selectedTripWaypoints.length)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryKey}>Photos</Text>
                    <Text style={styles.summaryValue}>{String(selectedTripAttachments.length)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryKey}>Sync</Text>
                    <Text style={styles.summaryValue}>{selectedTrip.syncStatus}</Text>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Waypoints</Text>
                {selectedTripWaypoints.length === 0 ? (
                  <Text style={styles.empty}>No notes saved on this trip.</Text>
                ) : (
                  selectedTripWaypoints.map((waypoint) => {
                    const attachments = getAttachmentsForWaypoint(waypoint.localId);

                    return (
                      <View key={waypoint.localId} style={styles.detailsCard}>
                        <View style={styles.detailsCardHeader}>
                          <Text style={styles.detailsCardTitle}>{waypoint.title}</Text>
                          <Pressable onPress={() => openWaypointEdit(waypoint)} style={styles.inlineLink}>
                            <Text style={styles.inlineLinkText}>Edit note</Text>
                          </Pressable>
                        </View>
                        {waypoint.note ? (
                          <Text style={styles.detailsCardText}>{waypoint.note}</Text>
                        ) : null}
                        <Text style={styles.detailsCardMeta}>
                          {new Date(waypoint.createdAt).toLocaleString()}
                        </Text>

                        {attachments.map((attachment) => (
                          <View key={attachment.localId} style={styles.attachmentCard}>
                            <Image source={{ uri: attachment.localUri }} style={styles.attachmentImage} />
                            <Pressable
                              onPress={() => void handleRemovePhoto(attachment.localId)}
                              style={styles.removePhotoButton}
                            >
                              <Text style={styles.removePhotoText}>Remove photo</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    );
                  })
                )}

                <View style={styles.modalActions}>
                  <Pressable onPress={() => setTripDetailsVisible(false)} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>Close</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      <Text style={styles.subtitle}>Your local recorded routes and saved trip content.</Text>

      {tripSummaries.length === 0 ? (
        <Text style={styles.empty}>No local trips yet.</Text>
      ) : (
        <View style={styles.list}>
          {tripSummaries.map(({ trip, waypointCount, photoCount }) => {
            const statusLabel = trip.endedAt === null ? "Active" : trip.syncStatus;

            return (
              <View key={trip.localId} style={styles.tripCard}>
                <View style={styles.tripHeader}>
                  <View style={styles.tripHeaderText}>
                    <Text style={styles.tripTitle}>{trip.title}</Text>
                    {trip.description ? (
                      <Text style={styles.tripDescription}>{trip.description}</Text>
                    ) : null}
                  </View>
                  <View style={styles.tripBadge}>
                    <Text style={styles.tripBadgeText}>{statusLabel}</Text>
                  </View>
                </View>

                <View style={styles.metaGrid}>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaKey}>Mode</Text>
                    <Text style={styles.metaValue}>{getRecordingProfileLabel(trip.recordingProfile)}</Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaKey}>Waypoints</Text>
                    <Text style={styles.metaValue}>{String(waypointCount)}</Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaKey}>Photos</Text>
                    <Text style={styles.metaValue}>{String(photoCount)}</Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaKey}>Started</Text>
                    <Text style={styles.metaValue}>{new Date(trip.startedAt).toLocaleDateString()}</Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaKey}>Ended</Text>
                    <Text style={styles.metaValue}>
                      {trip.endedAt ? new Date(trip.endedAt).toLocaleDateString() : "Active"}
                    </Text>
                  </View>
                  <View style={styles.metaCell}>
                    <Text style={styles.metaKey}>Sync</Text>
                    <Text style={styles.metaValue}>{trip.syncStatus}</Text>
                  </View>
                </View>

                <View style={styles.cardActions}>
                  <Pressable onPress={() => openTripDetails(trip)} style={styles.actionButton}>
                    <Text style={styles.actionButtonText}>Open</Text>
                  </Pressable>
                  <Pressable onPress={() => openTripEdit(trip)} style={styles.actionButton}>
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </Pressable>
                  {trip.endedAt === null ? (
                    <Pressable
                      onPress={() => void handleResumeTrip(trip)}
                      style={[styles.actionButton, styles.resumeActionButton]}
                    >
                      <Text style={[styles.actionButtonText, styles.resumeActionText]}>Resume</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => void handleDeleteTrip(trip)}
                      style={[styles.actionButton, styles.deleteActionButton]}
                    >
                      <Text style={[styles.actionButtonText, styles.deleteActionText]}>Delete</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {pendingUndo ? (
        <View style={styles.undoBanner}>
          <View style={styles.undoTextBlock}>
            <Text style={styles.undoTitle}>Trip deleted</Text>
            <Text numberOfLines={1} style={styles.undoText}>
              {pendingUndo.tripTitle}
            </Text>
          </View>
          <Pressable onPress={() => void handleUndoDelete()} style={styles.undoButton}>
            <Text style={styles.undoButtonText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 15,
    color: "#52624f",
    marginBottom: 16,
  },
  empty: {
    fontSize: 15,
    color: "#52624f",
  },
  list: {
    gap: 14,
    paddingBottom: 20,
  },
  tripCard: {
    borderRadius: 22,
    backgroundColor: "#f6f1e5",
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#ebe1cf",
  },
  tripHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  tripHeaderText: {
    flex: 1,
    gap: 4,
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#243224",
  },
  tripDescription: {
    fontSize: 14,
    color: "#4f5f4f",
    lineHeight: 20,
  },
  tripBadge: {
    borderRadius: 999,
    backgroundColor: "#e2ecda",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tripBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#355035",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    rowGap: 10,
  },
  metaCell: {
    width: "50%",
    paddingHorizontal: 4,
    gap: 2,
  },
  metaKey: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#76856f",
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#243224",
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#e6ece1",
    paddingVertical: 12,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  deleteActionButton: {
    backgroundColor: "#f7e0db",
  },
  deleteActionText: {
    color: "#9f3f31",
  },
  resumeActionButton: {
    backgroundColor: "#dfead9",
  },
  resumeActionText: {
    color: "#355035",
  },
  undoBanner: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#243224",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  undoTextBlock: {
    flex: 1,
    gap: 2,
  },
  undoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  undoText: {
    fontSize: 13,
    color: "#dbe6d5",
  },
  undoButton: {
    borderRadius: 999,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  undoButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  modalScreen: {
    flex: 1,
    backgroundColor: "#f3efe6",
  },
  modalContent: {
    padding: 24,
    gap: 14,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2a1f",
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
    minHeight: 110,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#243224",
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fffdf8",
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#e6ece1",
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  disabledButton: {
    opacity: 0.45,
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  detailsHeaderText: {
    flex: 1,
    gap: 6,
  },
  detailsDescription: {
    fontSize: 15,
    lineHeight: 21,
    color: "#52624f",
  },
  editChip: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
    rowGap: 10,
  },
  summaryItem: {
    width: "50%",
    paddingHorizontal: 5,
    gap: 2,
  },
  summaryKey: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#76856f",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#243224",
  },
  sectionTitle: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "700",
    color: "#243224",
  },
  detailsCard: {
    borderRadius: 18,
    backgroundColor: "#fffdf8",
    padding: 14,
    gap: 8,
  },
  detailsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailsCardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  inlineLink: {
    paddingVertical: 4,
  },
  inlineLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  detailsCardText: {
    fontSize: 14,
    color: "#4f5f4f",
    lineHeight: 20,
  },
  detailsCardMeta: {
    fontSize: 12,
    color: "#76856f",
  },
  attachmentCard: {
    gap: 8,
  },
  attachmentImage: {
    width: "100%",
    height: 170,
    borderRadius: 14,
    backgroundColor: "#d7ddcf",
  },
  removePhotoButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#f7e0db",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  removePhotoText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9f3f31",
  },
});
