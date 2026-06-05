import { useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import IconButton from "../../components/ui/icon-button";
import {
  DEFAULT_WAYPOINT_CATEGORY,
  getWaypointCategoryOption,
} from "../../constants/waypoint-categories";
import type { WaypointAttachment } from "../../domain/trips";
import {
  DEMO_PHOTO_LIMIT_PER_TRIP,
  getRemainingDemoPhotoSlotsForTrip,
  isDemoSession,
} from "../../services/demo/demo-mode.service";
import {
  capturePhotoWithCamera,
  isCameraPermissionDeniedError,
  pickPhotosFromLibrary,
} from "../../services/media/photo-picker.service";
import { requestTrailbookPermissions } from "../../services/permissions/permission-manager.service";
import {
  getVisibleAttachmentsForWaypoints,
  getVisibleTrips,
  getVisibleWaypointsForTrip,
  markWaypointAttachmentDeleted,
  type WaypointUpdateInput,
  updateWaypointMetadata,
} from "../../services/trips/trips-management.service";
import {
  createAttachmentTimestamp,
  createPhotoAttachmentForWaypoint,
} from "../../services/waypoints/waypoints.service";
import { useSessionStore } from "../../state/session-store";
import {
  setWaypointAttachments,
  useWaypointAttachmentsStore,
} from "../../state/waypoint-attachments-store";
import { useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import WaypointEditModal from "./components/waypoint-edit-modal";

export default function TripWaypointScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ tripId?: string | string[]; waypointId?: string | string[] }>();
  const identitySession = useSessionStore((state) => state.identitySession);
  const trips = useTripsStore((state) => state.trips);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [waypointEditVisible, setWaypointEditVisible] = useState(false);
  const [waypointDraft, setWaypointDraft] = useState<WaypointUpdateInput>({
    category: DEFAULT_WAYPOINT_CATEGORY,
    title: "",
    note: "",
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);

  const resolvedTripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const resolvedWaypointId = Array.isArray(params.waypointId) ? params.waypointId[0] : params.waypointId;

  const currentUserTrips = identitySession
    ? trips.filter((trip) => trip.userId === identitySession.userId)
    : [];
  const currentUserWaypoints = identitySession
    ? waypoints.filter((waypoint) => waypoint.userId === identitySession.userId)
    : [];
  const currentUserWaypointAttachments = identitySession
    ? waypointAttachments.filter((attachment) => attachment.userId === identitySession.userId)
    : [];

  const visibleTrips = getVisibleTrips(currentUserTrips);
  const selectedTrip = visibleTrips.find((trip) => trip.localId === resolvedTripId) ?? null;
  const tripWaypoints = selectedTrip ? getVisibleWaypointsForTrip(currentUserWaypoints, selectedTrip.localId) : [];
  const selectedWaypoint = tripWaypoints.find((waypoint) => waypoint.localId === resolvedWaypointId) ?? null;
  const waypointNavigationOrder = useMemo(
    () => [...tripWaypoints].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [tripWaypoints],
  );
  const selectedWaypointIndex = selectedWaypoint
    ? waypointNavigationOrder.findIndex((waypoint) => waypoint.localId === selectedWaypoint.localId)
    : -1;
  const previousWaypoint = selectedWaypointIndex > 0 ? waypointNavigationOrder[selectedWaypointIndex - 1] : null;
  const nextWaypoint =
    selectedWaypointIndex >= 0 && selectedWaypointIndex < waypointNavigationOrder.length - 1
      ? waypointNavigationOrder[selectedWaypointIndex + 1]
      : null;
  const attachments = selectedWaypoint
    ? getVisibleAttachmentsForWaypoints(currentUserWaypointAttachments, [selectedWaypoint.localId]).sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      )
    : [];

  const selectedPhotoSet = useMemo(() => new Set(selectedPhotoIds), [selectedPhotoIds]);
  const photoCarouselCardWidth = Math.min(Math.max(screenWidth * 0.74, 240), 340);
  const selectedWaypointCategory = selectedWaypoint
    ? getWaypointCategoryOption(selectedWaypoint.category)
    : null;

  function handleOpenEdit() {
    if (!selectedWaypoint) {
      return;
    }

    setWaypointDraft({
      category: selectedWaypoint.category,
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

    router.push(`/trips/${resolvedTripId}/waypoints/${resolvedWaypointId}/photos/${attachmentLocalId}`);
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

    if (selectedTrip && isDemoSession(identitySession)) {
      const remainingPhotoSlots = getRemainingDemoPhotoSlotsForTrip(
        selectedTrip.localId,
        currentUserWaypoints,
        currentUserWaypointAttachments,
      );

      if (remainingPhotoSlots <= 0) {
        Alert.alert(
          "Demo photo limit reached",
          `Demo mode allows up to ${DEMO_PHOTO_LIMIT_PER_TRIP} photos per trip.`,
        );
        return;
      }
    }

    const createdAt = new Date().toISOString();

    if (source === "camera") {
      let photo = null;

      try {
        photo = await capturePhotoWithCamera();
      } catch (error) {
        if (isCameraPermissionDeniedError(error)) {
          Alert.alert(
            "Camera permission needed",
            "Trailbook needs camera access to attach waypoint photos. Run permission setup again and allow camera access.",
            error.canAskAgain
              ? [{ text: "Set up permissions", onPress: () => void requestTrailbookPermissions() }]
              : [
                  { text: "Cancel", style: "cancel" },
                  { text: "Set up permissions", onPress: () => void requestTrailbookPermissions() },
                ],
          );
          return;
        }

        throw error;
      }

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

    if (selectedTrip && isDemoSession(identitySession)) {
      const remainingPhotoSlots = getRemainingDemoPhotoSlotsForTrip(
        selectedTrip.localId,
        currentUserWaypoints,
        currentUserWaypointAttachments,
      );
      const limitedPhotos = photos.slice(0, remainingPhotoSlots);

      if (limitedPhotos.length < photos.length) {
        Alert.alert(
          "Demo photo limit",
          `Only ${remainingPhotoSlots} more photo(s) can be added to this trip in demo mode.`,
        );
      }

      await setWaypointAttachments([
        ...waypointAttachments,
        ...limitedPhotos.map((photo, index) =>
          createPhotoAttachmentForWaypoint(selectedWaypoint, photo, createAttachmentTimestamp(createdAt, index)),
        ),
      ]);
      return;
    }

    await setWaypointAttachments([
      ...waypointAttachments,
      ...photos.map((photo, index) =>
        createPhotoAttachmentForWaypoint(selectedWaypoint, photo, createAttachmentTimestamp(createdAt, index)),
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

  function handleNavigateWaypoint(waypointLocalId: string | null) {
    if (!resolvedTripId || !waypointLocalId) {
      return;
    }

    setSelectionMode(false);
    setSelectedPhotoIds([]);
    router.replace(`/trips/${resolvedTripId}/waypoints/${waypointLocalId}`);
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (!selectedTrip || !selectedWaypoint) {
    return (
      <ScreenLayout
        accountEmail={identitySession.userEmail}
        accountMode={identitySession.mode}
        contentVariant="plain"
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
        accountMode={identitySession.mode}
        contentStyle={styles.screenContent}
        contentVariant="plain"
        onBack={() => router.back()}
        showBottomNavigation
        title="Waypoint"
    >
      <WaypointEditModal
        draft={waypointDraft}
        onChangeCategory={(category) => setWaypointDraft((current) => ({ ...current, category }))}
        onChangeNote={(note) => setWaypointDraft((current) => ({ ...current, note }))}
        onChangeTitle={(title) => setWaypointDraft((current) => ({ ...current, title }))}
        onClose={() => setWaypointEditVisible(false)}
        onSave={() => void handleSaveWaypointEdit()}
        visible={waypointEditVisible}
      />

      {selectedWaypointCategory ? (
        <View style={styles.categoryRow}>
          <View style={[styles.categoryBadge, { backgroundColor: selectedWaypointCategory.color }]}>
            <MaterialIcons
              color="#fffdf8"
              name={selectedWaypointCategory.iconName}
              size={16}
            />
            <Text style={styles.categoryBadgeText}>{selectedWaypointCategory.label}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.headerCard}>
        <View style={styles.headerCardRow}>
          <IconButton
            accessibilityLabel="Previous waypoint"
            disabled={!previousWaypoint}
            disabledIconColor="#9da894"
            icon="chevron-left"
            iconSize={26}
            onPress={() => handleNavigateWaypoint(previousWaypoint?.localId ?? null)}
            style={!previousWaypoint && styles.waypointNavButtonDisabled}
          />
          <View style={styles.titleGroup}>
            <Text numberOfLines={2} style={styles.title}>{selectedWaypoint.title}</Text>
            <IconButton
              accessibilityLabel="Edit waypoint"
              icon="edit"
              onPress={handleOpenEdit}
              size="sm"
            />
          </View>
          <IconButton
            accessibilityLabel="Next waypoint"
            disabled={!nextWaypoint}
            disabledIconColor="#9da894"
            icon="chevron-right"
            iconSize={26}
            onPress={() => handleNavigateWaypoint(nextWaypoint?.localId ?? null)}
            style={!nextWaypoint && styles.waypointNavButtonDisabled}
          />
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
        <ScrollView
          contentContainerStyle={styles.photoCarouselContent}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToAlignment="start"
          snapToInterval={photoCarouselCardWidth + 12}
          decelerationRate="fast"
        >
          {attachments.map((attachment) => {
            const selected = selectedPhotoSet.has(attachment.localId);

            return (
              <Pressable
                key={attachment.localId}
                onLongPress={() => enterSelectionMode(attachment.localId)}
                onPress={() => handlePhotoPress(attachment.localId)}
                style={[
                  styles.photoCarouselCard,
                  { width: photoCarouselCardWidth },
                  selected && styles.photoCardSelected,
                ]}
              >
                <Image source={{ uri: attachment.localUri }} style={styles.photoCarouselImage} />
                {selectionMode ? (
                  <View style={styles.photoSelectionBadge}>
                    <Text style={styles.photoSelectionBadgeText}>{selected ? "Selected" : "Tap"}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
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
  categoryRow: {
    flexDirection: "row",
    marginTop: -6,
    marginBottom: 6,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fffdf8",
    textTransform: "uppercase",
    letterSpacing: 0.6,
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
    fontSize: 22,
    fontWeight: "700",
    color: "#243224",
    flexShrink: 1,
  },
  titleGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 0,
  },
  waypointNavButtonDisabled: {
    opacity: 0.45,
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
  photoCarouselCard: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    shadowColor: "#243224",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  },
  photoCarouselContent: {
    gap: 12,
    paddingRight: 18,
    paddingBottom: 4,
  },
  photoCardSelected: {
    opacity: 0.72,
  },
  photoCarouselImage: {
    width: "100%",
    aspectRatio: 1.08,
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
