import { useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import type { WaypointAttachment } from "../../domain/trips";
import {
  capturePhotoWithCamera,
  pickPhotosFromLibrary,
} from "../../services/media/photo-picker.service";
import {
  getVisibleAttachmentsForWaypoints,
  getVisibleTrips,
  getVisibleWaypointsForTrip,
  markWaypointAttachmentDeleted,
  type WaypointUpdateInput,
  updateWaypointMetadata,
} from "../../services/trips/trips-management.service";
import { createPhotoAttachmentForWaypoint } from "../../services/waypoints/waypoints.service";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import {
  setWaypointAttachments,
  useWaypointAttachmentsStore,
} from "../../state/waypoint-attachments-store";
import { useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import WaypointEditModal from "./components/waypoint-edit-modal";
import WaypointPhotoViewerModal from "./components/waypoint-photo-viewer-modal";

export default function TripWaypointScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string | string[]; waypointId?: string | string[] }>();
  const identitySession = useSessionStore((state) => state.identitySession);
  const trips = useTripsStore((state) => state.trips);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [waypointEditVisible, setWaypointEditVisible] = useState(false);
  const [waypointDraft, setWaypointDraft] = useState<WaypointUpdateInput>({ title: "", note: "" });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [selectedPhotoAttachmentId, setSelectedPhotoAttachmentId] = useState<string | null>(null);

  const resolvedTripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const resolvedWaypointId = Array.isArray(params.waypointId) ? params.waypointId[0] : params.waypointId;

  const visibleTrips = getVisibleTrips(trips);
  const selectedTrip = visibleTrips.find((trip) => trip.localId === resolvedTripId) ?? null;
  const tripWaypoints = selectedTrip ? getVisibleWaypointsForTrip(waypoints, selectedTrip.localId) : [];
  const selectedWaypoint = tripWaypoints.find((waypoint) => waypoint.localId === resolvedWaypointId) ?? null;
  const attachments = selectedWaypoint
    ? getVisibleAttachmentsForWaypoints(waypointAttachments, [selectedWaypoint.localId]).sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      )
    : [];

  const selectedPhotoSet = useMemo(() => new Set(selectedPhotoIds), [selectedPhotoIds]);
  const photoViewerVisible = selectedPhotoAttachmentId !== null && attachments.length > 0;

  async function handleLogout() {
    await setActiveIdentitySession(null);
  }

  function handleOpenEdit() {
    if (!selectedWaypoint) {
      return;
    }

    setWaypointDraft({
      title: selectedWaypoint.title,
      note: selectedWaypoint.note ?? "",
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

  function enterSelectionMode(attachmentLocalId: string) {
    setSelectionMode(true);
    setSelectedPhotoIds([attachmentLocalId]);
  }

  function toggleSelectedPhoto(attachmentLocalId: string) {
    setSelectedPhotoIds((current) =>
      current.includes(attachmentLocalId)
        ? current.filter((item) => item !== attachmentLocalId)
        : [...current, attachmentLocalId],
    );
  }

  function handlePhotoPress(attachmentLocalId: string) {
    if (selectionMode) {
      toggleSelectedPhoto(attachmentLocalId);
      return;
    }

    setSelectedPhotoAttachmentId(attachmentLocalId);
  }

  async function handleRemoveSelectedPhotos() {
    if (selectedPhotoIds.length === 0) {
      return;
    }

    const deletedAt = new Date().toISOString();
    let nextAttachments: WaypointAttachment[] = waypointAttachments;

    for (const attachmentLocalId of selectedPhotoIds) {
      nextAttachments = markWaypointAttachmentDeleted(nextAttachments, attachmentLocalId, deletedAt);
    }

    await setWaypointAttachments(nextAttachments);
    setSelectedPhotoIds([]);
    setSelectionMode(false);
  }

  async function handleAddPhotos(source: "camera" | "library") {
    if (!selectedWaypoint) {
      return;
    }

    const createdAt = new Date().toISOString();

    if (source === "camera") {
      const photo = await capturePhotoWithCamera();

      if (!photo) {
        return;
      }

      await setWaypointAttachments([
        ...waypointAttachments,
        createPhotoAttachmentForWaypoint(selectedWaypoint, photo, createdAt),
      ]);
      return;
    }

    const photos = await pickPhotosFromLibrary();

    if (photos.length === 0) {
      return;
    }

    await setWaypointAttachments([
      ...waypointAttachments,
      ...photos.map((photo, index) =>
        createPhotoAttachmentForWaypoint(selectedWaypoint, photo, `${createdAt}-${index}`),
      ),
    ]);
  }

  function handlePromptAddPhotos() {
    Alert.alert("Add photos", "How do you want to add photos to this waypoint?", [
      { text: "Cancel", style: "cancel" },
      { text: "Camera", onPress: () => void handleAddPhotos("camera") },
      { text: "Library", onPress: () => void handleAddPhotos("library") },
    ]);
  }

  async function handleRemoveCurrentPhoto(attachmentLocalId: string) {
    const currentIndex = attachments.findIndex((attachment) => attachment.localId === attachmentLocalId);
    const fallbackAttachment = attachments[currentIndex + 1] ?? attachments[currentIndex - 1] ?? null;

    await setWaypointAttachments(
      markWaypointAttachmentDeleted(waypointAttachments, attachmentLocalId, new Date().toISOString()),
    );
    setSelectedPhotoAttachmentId(fallbackAttachment?.localId ?? null);
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (!selectedTrip || !selectedWaypoint) {
    return (
      <ScreenLayout
        accountEmail={identitySession.userEmail}
        contentVariant="plain"
        onLogout={() => void handleLogout()}
        showBottomNavigation
        title="Waypoint"
      >
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Waypoint not found</Text>
          <Text style={styles.emptyText}>The selected waypoint is no longer available.</Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
      <ScreenLayout
        accountEmail={identitySession.userEmail}
        contentStyle={styles.screenContent}
        contentVariant="plain"
        onBack={() => router.back()}
        onLogout={() => void handleLogout()}
        showBottomNavigation
        title="Waypoint"
    >
      <WaypointEditModal
        draft={waypointDraft}
        onChangeNote={(note) => setWaypointDraft((current) => ({ ...current, note }))}
        onChangeTitle={(title) => setWaypointDraft((current) => ({ ...current, title }))}
        onClose={() => setWaypointEditVisible(false)}
        onSave={() => void handleSaveWaypointEdit()}
        visible={waypointEditVisible}
      />

      <WaypointPhotoViewerModal
        attachments={attachments}
        onClose={() => setSelectedPhotoAttachmentId(null)}
        onRemoveCurrent={(attachmentLocalId) => void handleRemoveCurrentPhoto(attachmentLocalId)}
        selectedAttachmentId={selectedPhotoAttachmentId}
        visible={photoViewerVisible}
      />

      <View style={styles.headerCard}>
        <View style={styles.headerCardRow}>
          <Text style={styles.title}>{selectedWaypoint.title}</Text>
          <Pressable onPress={handleOpenEdit} style={styles.headerEditButton}>
            <Text style={styles.headerEditButtonText}>Edit</Text>
          </Pressable>
        </View>
        {selectedWaypoint.note ? <Text style={styles.note}>{selectedWaypoint.note}</Text> : null}
      </View>

      <View style={styles.photoHeader}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <Pressable onPress={handlePromptAddPhotos} style={styles.secondaryAction}>
          <Text style={styles.secondaryActionText}>Add photo(s)</Text>
        </Pressable>
      </View>

      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionText}>{selectedPhotoIds.length} selected</Text>
          <View style={styles.selectionActions}>
            <Pressable
              onPress={() => {
                setSelectionMode(false);
                setSelectedPhotoIds([]);
              }}
              style={styles.selectionSecondary}
            >
              <Text style={styles.selectionSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={selectedPhotoIds.length === 0}
              onPress={() => void handleRemoveSelectedPhotos()}
              style={[
                styles.selectionPrimary,
                selectedPhotoIds.length === 0 && styles.selectionPrimaryDisabled,
              ]}
            >
              <Text style={styles.selectionPrimaryText}>Remove selected</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={styles.helperText}>
          Tap a photo to open full screen. Long press to enter selection mode.
        </Text>
      )}

      {attachments.length === 0 ? (
        <View style={styles.emptyPhotos}>
          <Text style={styles.emptyText}>No photos saved for this waypoint.</Text>
        </View>
      ) : (
        <View style={styles.photoGrid}>
          {attachments.map((attachment) => {
            const selected = selectedPhotoSet.has(attachment.localId);

            return (
              <Pressable
                key={attachment.localId}
                onLongPress={() => enterSelectionMode(attachment.localId)}
                onPress={() => handlePhotoPress(attachment.localId)}
                style={[styles.photoCard, selected && styles.photoCardSelected]}
              >
                <Image source={{ uri: attachment.localUri }} style={styles.photoImage} />
                {selectionMode ? (
                  <View style={styles.photoSelectionBadge}>
                    <Text style={styles.photoSelectionBadgeText}>{selected ? "Selected" : "Tap"}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 16,
    paddingBottom: 28,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#243224",
  },
  emptyText: {
    fontSize: 15,
    color: "#52624f",
    textAlign: "center",
  },
  primaryAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#243224",
    paddingVertical: 12,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fffdf8",
  },
  secondaryAction: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  headerCard: {
    borderRadius: 20,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    padding: 18,
    gap: 6,
    marginBottom: 8,
  },
  headerCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: "700",
    color: "#243224",
  },
  headerEditButton: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headerEditButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  note: {
    fontSize: 15,
    lineHeight: 21,
    color: "#4f5f4f",
  },
  photoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#243224",
  },
  helperText: {
    fontSize: 14,
    color: "#52624f",
  },
  selectionBar: {
    borderRadius: 16,
    backgroundColor: "#243224",
    padding: 14,
    gap: 12,
  },
  selectionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fffdf8",
  },
  selectionActions: {
    flexDirection: "row",
    gap: 10,
  },
  selectionSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#dbe6d5",
    paddingVertical: 12,
  },
  selectionSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  selectionPrimary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#8f3428",
    paddingVertical: 12,
  },
  selectionPrimaryDisabled: {
    opacity: 0.45,
  },
  selectionPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff7f4",
  },
  emptyPhotos: {
    borderRadius: 18,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    padding: 20,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
    rowGap: 12,
  },
  photoCard: {
    width: "50%",
    paddingHorizontal: 6,
  },
  photoCardSelected: {
    opacity: 0.72,
  },
  photoImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: "#d7ddcf",
  },
  photoSelectionBadge: {
    position: "absolute",
    right: 14,
    top: 8,
    borderRadius: 999,
    backgroundColor: "rgba(36, 50, 36, 0.84)",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  photoSelectionBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fffdf8",
  },
});
