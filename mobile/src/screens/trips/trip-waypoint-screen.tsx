import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";

import ScreenLayout from "../../components/layout/screen-layout";
import IconButton from "../../components/ui/icon-button";
import {
  DEFAULT_WAYPOINT_CATEGORY,
  getWaypointCategoryOption,
} from "../../constants/waypoint-categories";
import type { Waypoint, WaypointAttachment } from "../../domain/trips";
import {
  getWaypointScreenModel,
  type WaypointScreenModel,
} from "../../repositories/waypoints-repository";
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
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import WaypointEditModal from "./components/waypoint-edit-modal";

const WAYPOINT_MAP_ROUTE_COLOR = "#4a8c4a";
const MAX_ROUTE_POINTS = 240;

interface MapCoordinate {
  latitude: number;
  longitude: number;
}

function buildWaypointMapRegion(
  routeCoordinates: MapCoordinate[],
  waypointCoordinate: MapCoordinate,
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } {
  const all = routeCoordinates.length > 0 ? [...routeCoordinates, waypointCoordinate] : [waypointCoordinate];
  let minLat = all[0].latitude;
  let maxLat = all[0].latitude;
  let minLon = all[0].longitude;
  let maxLon = all[0].longitude;

  for (const c of all) {
    if (c.latitude < minLat) minLat = c.latitude;
    if (c.latitude > maxLat) maxLat = c.latitude;
    if (c.longitude < minLon) minLon = c.longitude;
    if (c.longitude > maxLon) maxLon = c.longitude;
  }

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.004),
    longitudeDelta: Math.max((maxLon - minLon) * 1.4, 0.004),
  };
}

function downsampleRoute(coordinates: MapCoordinate[]): MapCoordinate[] {
  if (coordinates.length <= MAX_ROUTE_POINTS) {
    return coordinates;
  }

  const step = Math.ceil(coordinates.length / MAX_ROUTE_POINTS);

  return coordinates.filter((_, i) => i % step === 0 || i === coordinates.length - 1);
}

function sortWaypointsByCreatedAt(left: Waypoint, right: Waypoint): number {
  return left.createdAt.localeCompare(right.createdAt) || left.localId.localeCompare(right.localId);
}

function sortAttachmentsByCreatedAt(left: WaypointAttachment, right: WaypointAttachment): number {
  return left.createdAt.localeCompare(right.createdAt) || left.localId.localeCompare(right.localId);
}

function getWaypointNavigation(
  waypointLocalId: string,
  waypointOrder: Waypoint[],
): { nextWaypointLocalId: string | null; previousWaypointLocalId: string | null } {
  const waypointIndex = waypointOrder.findIndex((waypoint) => waypoint.localId === waypointLocalId);

  if (waypointIndex === -1) {
    return {
      nextWaypointLocalId: null,
      previousWaypointLocalId: null,
    };
  }

  return {
    nextWaypointLocalId: waypointOrder[waypointIndex + 1]?.localId ?? null,
    previousWaypointLocalId: waypointOrder[waypointIndex - 1]?.localId ?? null,
  };
}

function buildLocalWaypointModel(
  currentModel: WaypointScreenModel,
  waypointLocalId: string,
  waypoints: Waypoint[],
  waypointAttachments: WaypointAttachment[],
): WaypointScreenModel | null {
  const waypointOrder = waypoints
    .filter((waypoint) => waypoint.tripLocalId === currentModel.trip.localId && waypoint.deletedAt === null)
    .sort(sortWaypointsByCreatedAt);
  const waypoint = waypointOrder.find((candidate) => candidate.localId === waypointLocalId) ?? null;

  if (!waypoint) {
    return null;
  }

  return {
    ...currentModel,
    attachments: waypointAttachments
      .filter((attachment) => attachment.waypointLocalId === waypoint.localId && attachment.deletedAt === null)
      .sort(sortAttachmentsByCreatedAt),
    navigation: getWaypointNavigation(waypoint.localId, waypointOrder),
    waypoint,
    waypointOrder,
  };
}

export default function TripWaypointScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ tripId?: string | string[]; waypointId?: string | string[] }>();
  const identitySession = useSessionStore((state) => state.identitySession);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [waypointModel, setWaypointModel] = useState<WaypointScreenModel | null>(null);
  const [waypointModelLoading, setWaypointModelLoading] = useState(true);
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

  const currentUserWaypoints = identitySession
    ? waypoints.filter((waypoint) => waypoint.userId === identitySession.userId)
    : [];
  const currentUserWaypointAttachments = identitySession
    ? waypointAttachments.filter((attachment) => attachment.userId === identitySession.userId)
    : [];

  const selectedTrip = waypointModel?.trip ?? null;
  const selectedWaypoint = waypointModel?.waypoint ?? null;
  const hasResolvedWaypointModel =
    waypointModel?.trip.localId === resolvedTripId && waypointModel?.waypoint.localId === resolvedWaypointId;
  const previousWaypointLocalId = waypointModel?.navigation.previousWaypointLocalId ?? null;
  const nextWaypointLocalId = waypointModel?.navigation.nextWaypointLocalId ?? null;
  const attachments = waypointModel?.attachments ?? [];

  const selectedPhotoSet = useMemo(() => new Set(selectedPhotoIds), [selectedPhotoIds]);
  const photoCarouselCardWidth = Math.min(Math.max(screenWidth * 0.72, 240), 340);
  const selectedWaypointCategory = selectedWaypoint
    ? getWaypointCategoryOption(selectedWaypoint.category)
    : null;
  const displayRouteCoordinates = useMemo(
    () => downsampleRoute(waypointModel?.routeCoordinates ?? []),
    [waypointModel?.routeCoordinates],
  );
  const waypointMapRegion = useMemo(
    () =>
      selectedWaypoint
        ? buildWaypointMapRegion(displayRouteCoordinates, {
            latitude: selectedWaypoint.latitude,
            longitude: selectedWaypoint.longitude,
          })
        : null,
    [selectedWaypoint, displayRouteCoordinates],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWaypointModel() {
      if (!identitySession || !resolvedTripId || !resolvedWaypointId) {
        setWaypointModel(null);
        setWaypointModelLoading(false);
        return;
      }

      setWaypointModelLoading(true);

      try {
        const nextWaypointModel = await getWaypointScreenModel({
          tripLocalId: resolvedTripId,
          userId: identitySession.userId,
          waypointLocalId: resolvedWaypointId,
        });

        if (!cancelled) {
          setWaypointModel(nextWaypointModel);
        }
      } finally {
        if (!cancelled) {
          setWaypointModelLoading(false);
        }
      }
    }

    void loadWaypointModel();

    return () => {
      cancelled = true;
    };
  }, [identitySession, resolvedTripId, resolvedWaypointId, waypointAttachments, waypoints]);

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

    const updatedAt = new Date().toISOString();

    await setWaypoints(
      updateWaypointMetadata(waypoints, selectedWaypoint.localId, waypointDraft, updatedAt),
    );

    if (waypointModel) {
      setWaypointModel({
        ...waypointModel,
        waypoint: {
          ...waypointModel.waypoint,
          category: waypointDraft.category,
          title: waypointDraft.title.trim(),
          note: waypointDraft.note.trim() || null,
          updatedAt,
          syncStatus: "pending-sync",
        },
      });
    }

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

    router.push(
      `/trips/${resolvedTripId}/waypoints/${selectedWaypoint?.localId ?? resolvedWaypointId}/photos/${attachmentLocalId}`,
    );
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

    if (waypointModel) {
      const nextModel = buildLocalWaypointModel(
        waypointModel,
        waypointLocalId,
        currentUserWaypoints,
        currentUserWaypointAttachments,
      );

      if (nextModel) {
        setWaypointModel(nextModel);
        setWaypointModelLoading(false);
      }
    }

    router.setParams({ waypointId: waypointLocalId });
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (waypointModelLoading && !hasResolvedWaypointModel) {
    return (
      <ScreenLayout
        accountEmail={identitySession.userEmail}
        accountMode={identitySession.mode}
        contentVariant="plain"
        showBottomNavigation
        title="Waypoint"
      />
    );
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
      scrollEnabled={false}
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

      <View style={styles.waypointShell}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
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

          {waypointMapRegion && selectedWaypoint ? (
            <View style={styles.waypointMapSection}>
              <Text style={styles.sectionTitle}>Location</Text>
              <View style={styles.waypointMapCard}>
                <MapView
                  liteMode={Platform.OS === "android"}
                  mapType="standard"
                  pitchEnabled={false}
                  pointerEvents="none"
                  region={waypointMapRegion}
                  rotateEnabled={false}
                  scrollEnabled={false}
                  style={styles.waypointMap}
                  toolbarEnabled={false}
                  zoomEnabled={false}
                >
                  {displayRouteCoordinates.length > 1 ? (
                    <Polyline
                      coordinates={displayRouteCoordinates}
                      strokeColor={WAYPOINT_MAP_ROUTE_COLOR}
                      strokeWidth={3}
                    />
                  ) : null}
                  <Marker
                    coordinate={{ latitude: selectedWaypoint.latitude, longitude: selectedWaypoint.longitude }}
                    pinColor="#e53935"
                    tracksViewChanges={false}
                  />
                </MapView>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View pointerEvents="box-none" style={styles.waypointBottomBarWrap}>
          <View style={styles.waypointBottomBar}>
            <IconButton
              accessibilityLabel="Previous waypoint"
              disabled={!previousWaypointLocalId}
              disabledIconColor="#9aa596"
              icon="chevron-left"
              iconSize={24}
              onPress={() => handleNavigateWaypoint(previousWaypointLocalId)}
              style={[styles.waypointNavButton, !previousWaypointLocalId && styles.waypointNavButtonDisabled]}
            />
            <Pressable onPress={handleOpenEdit} style={styles.waypointBottomCenter}>
              <View style={styles.titleRow}>
                {selectedWaypointCategory ? (
                  <View style={[styles.categoryIconBadge, { backgroundColor: selectedWaypointCategory.color }]}>
                    <MaterialIcons color="#fffdf8" name={selectedWaypointCategory.iconName} size={14} />
                  </View>
                ) : null}
                <Text numberOfLines={1} style={styles.title}>{selectedWaypoint.title}</Text>
              </View>
            </Pressable>
            <IconButton
              accessibilityLabel="Next waypoint"
              disabled={!nextWaypointLocalId}
              disabledIconColor="#9aa596"
              icon="chevron-right"
              iconSize={24}
              onPress={() => handleNavigateWaypoint(nextWaypointLocalId)}
              style={[styles.waypointNavButton, !nextWaypointLocalId && styles.waypointNavButtonDisabled]}
            />
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
  waypointShell: {
    flex: 1,
    position: "relative",
  },
  scrollContent: {
    gap: 2,
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 120,
  },
  waypointBottomBarWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 4,
  },
  waypointBottomBar: {
    minHeight: 64,
    borderRadius: 22,
    backgroundColor: "rgba(255, 253, 248, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(235, 225, 207, 0.9)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#142014",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
  },
  waypointNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(230, 236, 225, 0.9)",
  },
  waypointBottomCenter: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  categoryIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
  waypointNavButtonDisabled: {
    opacity: 0.42,
  },
  title: {
    flex: 1,
    fontSize: 17,
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
  detailsOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(20, 28, 20, 0.28)",
  },
  detailsBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  detailsSheet: {
    width: "100%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "rgba(248, 244, 234, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(235, 225, 207, 0.92)",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 12,
    shadowColor: "#142014",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  detailsHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(82, 98, 79, 0.35)",
    marginBottom: 4,
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  detailsTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#243224",
  },
  detailsNote: {
    fontSize: 15,
    lineHeight: 22,
    color: "#4f5f4f",
  },
  waypointMapSection: {
    gap: 8,
  },
  waypointMapCard: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ddd5c4",
    height: 130,
  },
  waypointMap: {
    flex: 1,
  },
});
