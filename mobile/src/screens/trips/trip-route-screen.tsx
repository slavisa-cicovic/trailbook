import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import IconButton from "../../components/ui/icon-button";
import { getRecordingProfileLabel } from "../../constants/recording-profiles";
import { useFeatureFlags } from "../../core/hooks/use-feature-flags";
import type { RecordingProfile, Trip, TripPoint, Waypoint } from "../../domain/trips";
import {
  finalizeEndedTripSegments,
  updateTripSegmentMode,
} from "../../services/trip-segments/trip-segments.service";
import {
  type TripUpdateInput,
  updateTripMetadata,
} from "../../services/trips/trips-management.service";
import {
  formatDistanceKm,
} from "../../services/trip-points/trip-points.service";
import {
  applyRawEventReprocessing,
} from "../../services/recording/raw-event-reprocessing.service";
import {
  discardRawEventReprocessingUndoSnapshot,
  hasRawEventReprocessingUndoSnapshot,
  restoreRawEventReprocessingUndoSnapshot,
} from "../../services/recording/raw-event-reprocessing-undo.service";
import {
  loadTripPointsForTrip,
  replaceTripPointsForTrip,
} from "../../repositories/trip-points-repository";
import { loadTripSegments } from "../../repositories/trip-segments-repository";
import {
  getTripRouteScreenModel,
  loadTrips,
  type TripRouteScreenModel,
} from "../../repositories/trips-repository";
import { loadWaypoints } from "../../repositories/waypoints-repository";
import { useSessionStore } from "../../state/session-store";
import {
  hasPurchaseEntitlement,
  usePurchaseAccessStore,
} from "../../state/purchase-access-store";
import { setTripSegments, useTripSegmentsStore } from "../../state/trip-segments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import { enqueueAndDrainTripSync } from "../../services/sync/sync-actions.service";
import { useShareTripMutation } from "../../features/sharing/hooks/mutations/use-share-trip-mutation";
import { useTripShares, useShareRecipients } from "../../features/sharing/hooks/queries/use-trip-shares";
import TripEditModal from "./components/trip-edit-modal";
import TripShareModal from "./components/trip-share-modal";
import SegmentEditModal from "./components/segment-edit-modal";
import TripRouteMap, { type RoutePointInfo, type TrailbookMapType } from "./components/trip-route-map";

const mapTypeOptions: { label: string; value: TrailbookMapType }[] = [
  { label: "Map", value: "standard" },
  { label: "Satellite", value: "satellite" },
  { label: "Hybrid", value: "hybrid" },
];

const EMPTY_TRIP_POINTS: TripPoint[] = [];

type EditableProfile = RecordingProfile;

function buildTripMapRegion(
  coordinates: { latitude: number; longitude: number }[],
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null {
  if (coordinates.length === 0) {
    return null;
  }

  if (coordinates.length === 1) {
    return {
      latitude: coordinates[0].latitude,
      longitude: coordinates[0].longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }

  let minLatitude = coordinates[0].latitude;
  let maxLatitude = coordinates[0].latitude;
  let minLongitude = coordinates[0].longitude;
  let maxLongitude = coordinates[0].longitude;

  for (const coordinate of coordinates) {
    minLatitude = Math.min(minLatitude, coordinate.latitude);
    maxLatitude = Math.max(maxLatitude, coordinate.latitude);
    minLongitude = Math.min(minLongitude, coordinate.longitude);
    maxLongitude = Math.max(maxLongitude, coordinate.longitude);
  }

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.4, 0.01),
  };
}

function formatBatteryState(state: string | null): string {
  switch (state) {
    case "charging":
      return "charging";
    case "full":
      return "full";
    case "unplugged":
      return "unplugged";
    case "unknown":
    case null:
    default:
      return "unknown";
  }
}

function formatBatterySnapshot(levelPercent: number | null, state: string | null): string {
  const stateLabel = formatBatteryState(state);

  if (levelPercent === null) {
    return stateLabel;
  }

  return `${Math.round(levelPercent)}% ${stateLabel}`;
}

function formatBatteryConsumption(startLevelPercent: number | null, endLevelPercent: number | null): string {
  if (startLevelPercent === null || endLevelPercent === null) {
    return "unknown";
  }

  const consumed = Math.max(0, Math.round(startLevelPercent - endLevelPercent));

  return `${consumed}%`;
}

function buildTripRoutePath(tripLocalId: string, groupLocalId: string | undefined): string {
  if (!groupLocalId) {
    return `/trips/${tripLocalId}`;
  }

  return `/trips/${tripLocalId}?groupId=${encodeURIComponent(groupLocalId)}`;
}

export default function TripRouteScreen() {
  const router = useRouter();
  const { groupId, tripId } = useLocalSearchParams<{
    groupId?: string | string[];
    tripId?: string | string[];
  }>();
  const identitySession = useSessionStore((state) => state.identitySession);
  const featureFlags = useFeatureFlags();
  const trips = useTripsStore((state) => state.trips);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const purchaseAccess = usePurchaseAccessStore((state) => state.access);
  const purchaseAccessLoading = usePurchaseAccessStore((state) => state.loading);
  const currentUserId = identitySession?.userId ?? null;

  const [tripEditVisible, setTripEditVisible] = useState(false);
  const [tripShareVisible, setTripShareVisible] = useState(false);
  const [detailsSheetVisible, setDetailsSheetVisible] = useState(false);
  const [mapType, setMapType] = useState<TrailbookMapType>("standard");
  const [shareRecipientEmail, setShareRecipientEmail] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [resolvedShareTripId, setResolvedShareTripId] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncIconRotation] = useState(() => new Animated.Value(0));
  const [rawReprocessBusy, setRawReprocessBusy] = useState(false);
  const [rawReprocessUndoAvailable, setRawReprocessUndoAvailable] = useState(false);
  const [rawReprocessUndoBannerVisible, setRawReprocessUndoBannerVisible] = useState(false);
  const [segmentEditSegmentId, setSegmentEditSegmentId] = useState<string | null>(null);
  const [routeModel, setRouteModel] = useState<TripRouteScreenModel | null>(null);
  const [routePointsLoading, setRoutePointsLoading] = useState(false);
  const [tripDraft, setTripDraft] = useState<TripUpdateInput>({
    title: "",
    description: "",
  });

  const sharesQuery = useTripShares(resolvedShareTripId, tripShareVisible);
  const recipientsQuery = useShareRecipients(tripShareVisible);
  const shareMutation = useShareTripMutation(resolvedShareTripId);

  const resolvedTripId = Array.isArray(tripId) ? tripId[0] : tripId;
  const resolvedGroupId = Array.isArray(groupId) ? groupId[0] : groupId;
  const currentUserTripSegments = useMemo(
    () => (currentUserId ? tripSegments.filter((segment) => segment.userId === currentUserId) : []),
    [currentUserId, tripSegments],
  );
  const currentUserWaypoints = useMemo(
    () => (currentUserId ? waypoints.filter((waypoint) => waypoint.userId === currentUserId) : []),
    [currentUserId, waypoints],
  );
  const selectedTrip = routeModel?.trip ?? null;
  const previousTripLocalId = routeModel?.navigation.previousTripLocalId ?? null;
  const nextTripLocalId = routeModel?.navigation.nextTripLocalId ?? null;
  const navigationGroupLocalId = routeModel?.navigation.groupLocalId ?? null;
  const selectedTripLocalId = selectedTrip?.localId ?? null;
  const selectedTripEndedAt = selectedTrip?.endedAt ?? null;
  const loadedSelectedTripPoints = routeModel?.tripPoints ?? EMPTY_TRIP_POINTS;
  const routeLoading = Boolean(resolvedTripId && (routePointsLoading || routeModel?.trip.localId !== resolvedTripId));
  const selectedTripSegments = routeModel?.selectedTripSegments ?? [];
  const selectedTripTimeline = routeModel?.selectedTripTimeline ?? [];
  const selectedTripWaypoints = routeModel?.selectedTripWaypoints ?? [];
  const selectedTripAttachments = routeModel?.selectedTripAttachments ?? [];
  const routeCoordinates = routeModel?.routeCoordinates ?? [];
  const segmentPolylines = routeModel?.segmentPolylines ?? [];
  const fallbackCoordinates = routeModel?.fallbackCoordinates ?? [];
  const waypointMarkers = routeModel?.waypointMarkers ?? [];
  const hasSyncEntitlement = hasPurchaseEntitlement(purchaseAccess, "sync");
  const hasPhotoStorageEntitlement = hasPurchaseEntitlement(purchaseAccess, "photo_storage");
  const hasSharingEntitlement = hasPurchaseEntitlement(purchaseAccess, "sharing");
  const hasUploadableAttachments = selectedTripAttachments.some(
    (attachment) =>
      attachment.deletedAt === null &&
      (!attachment.serverId || attachment.syncStatus !== "synced" || !attachment.localUri.startsWith("http")),
  );
  const syncUnavailableReason =
    identitySession?.mode !== "authenticated"
      ? null
      : !hasSyncEntitlement
        ? "Sync requires Trailbook Premium."
        : hasUploadableAttachments && !hasPhotoStorageEntitlement
          ? "Photo upload requires Trailbook Premium photo storage."
          : null;
  const sharingUnavailableReason =
    identitySession?.mode === "authenticated" && !hasSharingEntitlement
      ? "Sharing requires Trailbook Premium."
      : null;
  const routePointInfos: RoutePointInfo[] = useMemo(() => {
    if (!selectedTrip) {
      return [];
    }

    const selectedTripSegmentsForPoints = routeModel?.selectedTripSegments ?? [];
    const segmentProfileByLocalId = new Map(
      selectedTripSegmentsForPoints.map(({ segment }) => [segment.localId, segment.recordingProfile]),
    );

    return loadedSelectedTripPoints.map((point) => ({
      accuracy: point.accuracy,
      latitude: point.latitude,
      localId: point.localId,
      longitude: point.longitude,
      recordedAt: point.recordedAt,
      recordingProfile: point.segmentLocalId
        ? segmentProfileByLocalId.get(point.segmentLocalId) ?? selectedTrip.recordingProfile
        : selectedTrip.recordingProfile,
      speed: point.speed,
    }));
  }, [loadedSelectedTripPoints, routeModel?.selectedTripSegments, selectedTrip]);
  const selectedTripMapRegion = buildTripMapRegion(
    routeCoordinates.length > 0 ? routeCoordinates : fallbackCoordinates,
  );

  useEffect(() => {
    if (!syncBusy) {
      syncIconRotation.stopAnimation();
      syncIconRotation.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(syncIconRotation, {
        toValue: 1,
        duration: 850,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [syncBusy, syncIconRotation]);

  const syncIconAnimatedStyle = useMemo(
    () => ({
      transform: [
        {
          rotate: syncIconRotation.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "360deg"],
          }),
        },
      ],
    }),
    [syncIconRotation],
  );

  async function refreshRouteModel(
    tripLocalId: string,
    options: { showLoading?: boolean } = {},
  ): Promise<void> {
    const showLoading = options.showLoading ?? false;

    if (showLoading) {
      setRoutePointsLoading(true);
    }

    try {
      setRouteModel(
        await getTripRouteScreenModel({
          groupLocalId: resolvedGroupId ?? null,
          tripLocalId,
          userId: currentUserId,
        }),
      );
    } finally {
      if (showLoading) {
        setRoutePointsLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadRouteModel() {
      if (!resolvedTripId || !currentUserId) {
        setRouteModel(null);
        setRoutePointsLoading(false);
        return;
      }

      setRouteModel(null);
      setRoutePointsLoading(true);

      try {
        const nextRouteModel = await getTripRouteScreenModel({
          groupLocalId: resolvedGroupId ?? null,
          tripLocalId: resolvedTripId,
          userId: currentUserId,
        });

        if (!cancelled) {
          setRouteModel(nextRouteModel);
        }
      } finally {
        if (!cancelled) {
          setRoutePointsLoading(false);
        }
      }
    }

    void loadRouteModel();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, resolvedGroupId, resolvedTripId]);

  useEffect(() => {
    let cancelled = false;

    async function loadUndoAvailability() {
      if (!selectedTripLocalId) {
        setRawReprocessUndoAvailable(false);
        return;
      }

      const undoAvailable = await hasRawEventReprocessingUndoSnapshot(selectedTripLocalId);

      if (!cancelled) {
        setRawReprocessUndoAvailable(undoAvailable);
      }
    }

    void loadUndoAvailability();

    return () => {
      cancelled = true;
    };
  }, [selectedTripLocalId]);

  useEffect(() => {
    if (
      !selectedTripLocalId ||
      !selectedTripEndedAt ||
      routePointsLoading ||
      currentUserTripSegments.every(
        (segment) => segment.tripLocalId !== selectedTripLocalId || segment.endedAt !== null,
      )
    ) {
      return;
    }

    const finalizedTripSegments = finalizeEndedTripSegments(
      tripSegments,
      loadedSelectedTripPoints,
      selectedTripLocalId,
      selectedTripEndedAt,
    );
    const changed =
      finalizedTripSegments.length !== tripSegments.length ||
      finalizedTripSegments.some((segment, index) => {
        const currentSegment = tripSegments[index];
        return !currentSegment || currentSegment.localId !== segment.localId || currentSegment.endedAt !== segment.endedAt;
      });

    if (changed) {
      void setTripSegments(finalizedTripSegments);
    }
  }, [
    currentUserTripSegments,
    loadedSelectedTripPoints,
    routePointsLoading,
    selectedTripEndedAt,
    selectedTripLocalId,
    tripSegments,
  ]);

  async function syncSelectedTripIfNeeded() {
    if (!identitySession?.sessionToken || !selectedTrip) {
      throw new Error("You must be signed in to sync this trip.");
    }

    if (syncUnavailableReason) {
      throw new Error(syncUnavailableReason);
    }

    setSyncBusy(true);

    try {
      const tripLocalId = selectedTrip.localId;
      const drainResult = await enqueueAndDrainTripSync({
        identitySession,
        tripLocalId,
      });
      const syncedTrip = drainResult.trips?.find((trip) => trip.localId === tripLocalId);
      const serverId = syncedTrip?.serverId ?? selectedTrip.serverId;

      if (!serverId) {
        throw new Error("Trip sync did not return a server id.");
      }

      await refreshRouteModel(tripLocalId);

      return serverId;
    } finally {
      setSyncBusy(false);
    }
  }

  async function loadSelectedTripPointsForEdit(): Promise<TripPoint[]> {
    if (!selectedTrip) {
      return [];
    }

    if (routeModel?.trip.localId === selectedTrip.localId) {
      return loadedSelectedTripPoints;
    }

    const tripPoints = await loadTripPointsForTrip(selectedTrip.localId);

    return tripPoints;
  }

  async function handleShareTrip() {
    if (!resolvedShareTripId || !shareRecipientEmail.trim()) {
      return;
    }

    setShareSuccess(null);

    try {
      const response = await shareMutation.mutateAsync(shareRecipientEmail.trim());
      setShareSuccess(`Shared with ${response.recipient.email}`);
      setShareRecipientEmail("");
    } catch {
      // error is surfaced via shareMutation.error
    }
  }

  async function openTripShare() {
    if (!selectedTrip || !identitySession?.sessionToken) {
      return;
    }

    setShareError(null);
    setShareSuccess(null);

    if (sharingUnavailableReason) {
      setShareError(sharingUnavailableReason);
      setTripShareVisible(true);
      return;
    }

    try {
      const tripId = selectedTrip.serverId ?? (await syncSelectedTripIfNeeded());
      setResolvedShareTripId(tripId);
      setTripShareVisible(true);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Unable to load trip shares.");
      setTripShareVisible(true);
    }
  }

  function openTripEdit(trip: Trip) {
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
    await refreshRouteModel(selectedTrip.localId);

    if (
      identitySession?.mode === "authenticated" &&
      identitySession.sessionToken &&
      selectedTrip.status === "ended"
    ) {
      try {
        await syncSelectedTripIfNeeded();
      } catch (error) {
        Alert.alert("Edit sync failed", error instanceof Error ? error.message : "Trip edit could not be synced.");
      }
    }
  }

  async function handleUpdateSegmentProfile(nextProfile: EditableProfile) {
    if (!selectedTrip || !segmentEditSegmentId) {
      return;
    }

    if (selectedTrip.status !== "ended") {
      Alert.alert("Open trip", "Stop the route before editing segment modes.");
      return;
    }

    const updatedAt = new Date().toISOString();

    try {
      const selectedTripPointsForEdit = await loadSelectedTripPointsForEdit();
      const nextState = updateTripSegmentMode(
        currentUserTripSegments,
        selectedTripPointsForEdit,
        currentUserWaypoints,
        selectedTrip.localId,
        segmentEditSegmentId,
        nextProfile,
        updatedAt,
      );

      const nextTripSegments = tripSegments
        .map((segment) => nextState.tripSegments.find((candidate) => candidate.localId === segment.localId) ?? segment)
        .filter(
          (segment) =>
            segment.tripLocalId !== selectedTrip.localId ||
            nextState.tripSegments.some((candidate) => candidate.localId === segment.localId),
        );
      const nextSelectedTripPoints = nextState.tripPoints.filter(
        (tripPoint) => tripPoint.tripLocalId === selectedTrip.localId,
      );
      const nextWaypoints = waypoints.map(
        (waypoint) => nextState.waypoints.find((candidate) => candidate.localId === waypoint.localId) ?? waypoint,
      );

      await setTripSegments(nextTripSegments);
      await replaceTripPointsForTrip(selectedTrip.localId, nextSelectedTripPoints);
      await setWaypoints(nextWaypoints);
      await setTrips(
        trips.map((trip) =>
          trip.localId === selectedTrip.localId
            ? {
                ...trip,
                updatedAt,
                syncStatus: trip.syncStatus === "local-only" ? "local-only" : "pending-sync",
              }
            : trip,
        ),
      );
      await refreshRouteModel(selectedTrip.localId);

      setSegmentEditSegmentId(null);
    } catch (error) {
      Alert.alert(
        "Segment update failed",
        error instanceof Error ? error.message : "Unable to update this segment profile.",
      );
    }
  }

  async function handleApplyRawReprocessing() {
    if (!selectedTrip || !currentUserId || selectedTrip.status !== "ended" || rawReprocessUndoAvailable) {
      return;
    }

    setRawReprocessBusy(true);
    setDetailsSheetVisible(false);

    try {
      await applyRawEventReprocessing(selectedTrip.localId);
      const [nextTrips, nextTripSegments, nextWaypoints] = await Promise.all([
        loadTrips(),
        loadTripSegments(),
        loadWaypoints(),
      ]);

      await setTrips(nextTrips);
      await setTripSegments(nextTripSegments);
      await setWaypoints(nextWaypoints);
      await refreshRouteModel(selectedTrip.localId);
      setRawReprocessUndoAvailable(true);
      setRawReprocessUndoBannerVisible(true);
      setDetailsSheetVisible(false);
    } catch (error) {
      Alert.alert(
        "Raw reprocessing failed",
        error instanceof Error ? error.message : "Unable to reprocess this route from raw events.",
      );
    } finally {
      setRawReprocessBusy(false);
    }
  }

  async function applyRawReprocessingUndo() {
    if (!selectedTrip || rawReprocessBusy) {
      return;
    }

    setRawReprocessBusy(true);

    try {
      await restoreRawEventReprocessingUndoSnapshot(selectedTrip.localId);

      const [nextTrips, nextTripSegments, nextWaypoints] = await Promise.all([
        loadTrips(),
        loadTripSegments(),
        loadWaypoints(),
      ]);

      await setTrips(nextTrips);
      await setTripSegments(nextTripSegments);
      await setWaypoints(nextWaypoints);
      await refreshRouteModel(selectedTrip.localId);
      setRawReprocessUndoAvailable(false);
      setRawReprocessUndoBannerVisible(false);
      setDetailsSheetVisible(false);
    } catch (error) {
      Alert.alert(
        "Undo failed",
        error instanceof Error ? error.message : "Unable to restore the previous route data.",
      );
    } finally {
      setRawReprocessBusy(false);
    }
  }

  function handleUndoRawReprocessing() {
    if (!selectedTrip || !rawReprocessUndoAvailable) {
      return;
    }

    void applyRawReprocessingUndo();
  }

  async function handleKeepRawReprocessing() {
    if (!selectedTrip || !rawReprocessUndoAvailable) {
      return;
    }

    try {
      await discardRawEventReprocessingUndoSnapshot(selectedTrip.localId);
      setRawReprocessUndoAvailable(false);
      setRawReprocessUndoBannerVisible(false);
    } catch (error) {
      Alert.alert(
        "Keep route failed",
        error instanceof Error ? error.message : "Unable to discard the raw reprocessing undo snapshot.",
      );
    }
  }

  function handleSelectWaypoint(waypoint: Waypoint) {
    if (!selectedTrip) {
      return;
    }

    router.push(`/trips/${selectedTrip.localId}/waypoints/${waypoint.localId}`);
  }

  function handleNavigateTrip(tripLocalId: string | null) {
    if (!tripLocalId) {
      return;
    }

    setDetailsSheetVisible(false);
    router.replace(buildTripRoutePath(tripLocalId, navigationGroupLocalId ?? undefined));
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (!selectedTrip && routeLoading) {
    return (
      <ScreenLayout
        accountEmail={identitySession.userEmail}
        accountMode={identitySession.mode}
        contentVariant="plain"
        showBottomNavigation
        title="Route"
      >
        <View style={styles.emptyState}>
          <ActivityIndicator color="#355035" />
          <Text style={styles.emptyTitle}>Loading route</Text>
          <Text style={styles.emptyText}>Preparing map data for this trip.</Text>
        </View>
      </ScreenLayout>
    );
  }

  if (!selectedTrip) {
    return (
      <ScreenLayout
        accountEmail={identitySession.userEmail}
        accountMode={identitySession.mode}
        contentVariant="plain"
        showBottomNavigation
        title="Route"
      >
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Trip not found</Text>
          <Text style={styles.emptyText}>The selected trip is no longer available.</Text>
        </View>
      </ScreenLayout>
    );
  }

  const distanceText = routeLoading
    ? "Loading"
    : formatDistanceKm(
        selectedTripSegments.reduce((totalDistance, entry) => totalDistance + entry.distanceMeters, 0),
      );
  const syncIconColor = selectedTrip.syncStatus === "synced" ? "#243224" : "#b45309";
  const segmentEditTarget =
    segmentEditSegmentId === null
      ? null
      : selectedTripSegments.find(({ segment }) => segment.localId === segmentEditSegmentId)?.segment ?? null;
  const syncActionDisabled = syncBusy || purchaseAccessLoading || Boolean(syncUnavailableReason);
  const shareActionDisabled = purchaseAccessLoading || Boolean(sharingUnavailableReason);

  return (
    <ScreenLayout
      accountEmail={identitySession.userEmail}
      accountMode={identitySession.mode}
      contentStyle={styles.screenContent}
      contentVariant="plain"
      onBack={() => router.back()}
      scrollEnabled={false}
      showBottomNavigation
      title="Route"
    >
      <SegmentEditModal
        segment={segmentEditTarget}
        onClose={() => setSegmentEditSegmentId(null)}
        onSelectProfile={(profile) => void handleUpdateSegmentProfile(profile)}
      />

      <TripEditModal
        draft={tripDraft}
        onChangeDescription={(description) => setTripDraft((current) => ({ ...current, description }))}
        onChangeTitle={(title) => setTripDraft((current) => ({ ...current, title }))}
        onClose={() => setTripEditVisible(false)}
        onSave={() => void handleSaveTripEdit()}
        visible={tripEditVisible}
      />
      <TripShareModal
        busy={shareMutation.isPending || sharesQuery.isFetching}
        errorMessage={shareMutation.error instanceof Error ? shareMutation.error.message : shareError}
        existingShares={sharesQuery.data?.shares ?? []}
        onChangeRecipientEmail={setShareRecipientEmail}
        onClose={() => {
          setTripShareVisible(false);
          setShareError(null);
          setShareSuccess(null);
          setShareRecipientEmail("");
        }}
        onShare={() => void handleShareTrip()}
        recipientEmail={shareRecipientEmail}
        recipientSuggestions={recipientsQuery.data?.recipients ?? []}
        successMessage={shareSuccess}
        visible={tripShareVisible}
      />

      <Modal
        animationType="slide"
        onRequestClose={() => setDetailsSheetVisible(false)}
        transparent
        visible={detailsSheetVisible}
      >
        <View style={styles.routeDetailsOverlay}>
          <Pressable
            accessibilityLabel="Close route details"
            onPress={() => setDetailsSheetVisible(false)}
            style={styles.routeDetailsBackdrop}
          />
          <View style={styles.routeDetailsSheet}>
            <View style={styles.routeDetailsHandle} />
            <Text numberOfLines={1} style={styles.routeDetailsTitle}>
              {selectedTrip.title}
            </Text>
            <ScrollView
              contentContainerStyle={styles.routeDetailsBody}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.tripActionToolbar}>
                <IconButton
                  accessibilityLabel="Edit trip"
                  icon="edit"
                  onPress={() => {
                    setDetailsSheetVisible(false);
                    openTripEdit(selectedTrip);
                  }}
                />
                {selectedTrip.status === "ended" &&
                identitySession.mode === "authenticated" &&
                featureFlags.rawEventReprocessingEnabled ? (
                  rawReprocessUndoAvailable ? (
                    <IconButton
                      accessibilityLabel="Undo raw reprocessing"
                      disabled={rawReprocessBusy}
                      disabledIconColor="#6b7280"
                      icon="undo"
                      onPress={handleUndoRawReprocessing}
                      style={[styles.reprocessUndoButton, rawReprocessBusy && styles.headerIconButtonDisabled]}
                    />
                  ) : (
                    <IconButton
                      accessibilityLabel={rawReprocessBusy ? "Reprocessing route" : "Reprocess route"}
                      disabled={rawReprocessBusy}
                      disabledIconColor="#6b7280"
                      icon="replay"
                      onPress={() => void handleApplyRawReprocessing()}
                      style={[styles.reprocessButton, rawReprocessBusy && styles.headerIconButtonDisabled]}
                    />
                  )
                ) : null}
                {identitySession.mode === "authenticated" ? (
                  <>
                    <IconButton
                      accessibilityLabel={syncBusy ? "Syncing trip" : "Sync trip"}
                      disabled={syncActionDisabled}
                      onPress={() => void syncSelectedTripIfNeeded()}
                      style={[styles.syncButton, syncActionDisabled && styles.headerIconButtonDisabled]}
                    >
                      <Animated.View style={syncIconAnimatedStyle}>
                        <MaterialIcons color={syncActionDisabled ? "#6b7280" : syncIconColor} name="sync" size={18} />
                      </Animated.View>
                    </IconButton>
                    <IconButton
                      accessibilityLabel="Share trip"
                      disabled={shareActionDisabled}
                      icon="share"
                      onPress={() => {
                        setDetailsSheetVisible(false);
                        void openTripShare();
                      }}
                      style={[styles.shareButton, shareActionDisabled && styles.headerIconButtonDisabled]}
                    />
                  </>
                ) : null}
              </View>
              {syncUnavailableReason || sharingUnavailableReason ? (
                <Text style={styles.premiumHint}>
                  {syncUnavailableReason ?? sharingUnavailableReason}
                </Text>
              ) : null}
              {selectedTrip.description ? (
                <Text style={styles.tripDescription}>{selectedTrip.description}</Text>
              ) : null}
              {identitySession.mode !== "authenticated" ? (
                <Text style={styles.demoHint}>Demo trips stay local-only and cannot be shared.</Text>
              ) : null}
              {shareSuccess ? <Text style={styles.shareSuccessText}>{shareSuccess}</Text> : null}
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryKey}>Waypoints</Text>
                  <Text style={styles.summaryValue}>{String(selectedTripWaypoints.length)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryKey}>Photos</Text>
                  <Text style={styles.summaryValue}>{String(selectedTripAttachments.length)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryKey}>Distance</Text>
                  <Text style={styles.summaryValue}>{distanceText}</Text>
                </View>
              </View>
              <View style={styles.batteryConsumptionItem}>
                <Text style={styles.summaryKey}>Battery consumption</Text>
                <Text style={styles.summaryValue}>
                  {formatBatteryConsumption(
                    selectedTrip.batteryStartLevelPercent,
                    selectedTrip.batteryEndLevelPercent,
                  )}
                </Text>
                <Text style={styles.batteryConsumptionMeta}>
                  {formatBatterySnapshot(selectedTrip.batteryStartLevelPercent, selectedTrip.batteryStartState)}
                  {" -> "}
                  {formatBatterySnapshot(selectedTrip.batteryEndLevelPercent, selectedTrip.batteryEndState)}
                </Text>
              </View>
              {selectedTripTimeline.length > 0 ? (
                <View style={styles.segmentsList}>
                  <Text style={styles.segmentsTitle}>Timeline</Text>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={selectedTripTimeline.length > 3}
                    style={styles.segmentsScroll}
                  >
                    {selectedTripTimeline.map((entry) =>
                      entry.type === "segment" ? (
                        <View key={entry.segment.localId} style={styles.segmentRow}>
                          <View style={styles.segmentHeader}>
                            <View style={styles.segmentHeaderLead}>
                              <Text style={styles.segmentMode}>
                                {getRecordingProfileLabel(entry.segment.recordingProfile)}
                              </Text>
                              {selectedTrip.status === "ended" ? (
                                <Pressable
                                  onPress={() => {
                                    setDetailsSheetVisible(false);
                                    setSegmentEditSegmentId(entry.segment.localId);
                                  }}
                                  style={styles.segmentEditIconButton}
                                >
                                  <MaterialIcons color="#52624f" name="edit" size={16} />
                                </Pressable>
                              ) : null}
                            </View>
                            <Text style={styles.segmentDistance}>{formatDistanceKm(entry.distanceMeters)}</Text>
                          </View>
                          <Text style={styles.segmentMeta}>
                            {new Date(entry.segment.startedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" - "}
                            {entry.segment.endedAt
                              ? new Date(entry.segment.endedAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Active"}
                            {" • "}
                            {entry.durationLabel}
                          </Text>
                        </View>
                      ) : (
                        <View key={entry.pause.localId} style={[styles.segmentRow, styles.pauseRow]}>
                          <View style={styles.segmentHeader}>
                            <View style={styles.segmentHeaderLead}>
                              <Text style={styles.pauseMode}>Pause</Text>
                            </View>
                            <Text style={styles.pauseDuration}>{entry.durationLabel}</Text>
                          </View>
                          <Text style={styles.segmentMeta}>
                            {new Date(entry.pause.startedAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" - "}
                            {entry.pause.endedAt
                              ? new Date(entry.pause.endedAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Paused"}
                          </Text>
                        </View>
                      ),
                    )}
                  </ScrollView>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={styles.routeMapShell}>
        {routeLoading ? (
          <View style={styles.routeLoadingCard}>
            <ActivityIndicator color="#355035" />
            <Text style={styles.routeLoadingTitle}>Loading route</Text>
            <Text style={styles.routeLoadingText}>Preparing map data for this trip.</Text>
          </View>
        ) : (
          <TripRouteMap
            coordinates={routeCoordinates}
            mapType={mapType}
            onSelectWaypoint={handleSelectWaypoint}
            region={selectedTripMapRegion}
            routePointInfos={routePointInfos}
            segmentPolylines={segmentPolylines}
            waypointMarkers={waypointMarkers}
          />
        )}
        <View pointerEvents="box-none" style={styles.routeMapOverlay}>
          <View style={styles.mapTypeRow}>
            {mapTypeOptions.map((option) => {
              const selected = option.value === mapType;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => setMapType(option.value)}
                  style={[styles.mapTypeChip, selected && styles.mapTypeChipSelected]}
                >
                  <Text style={[styles.mapTypeChipText, selected && styles.mapTypeChipTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View pointerEvents="box-none" style={styles.routeBottomBarWrap}>
          <View style={styles.routeBottomBar}>
            <Pressable
              accessibilityLabel="Previous trip"
              disabled={!previousTripLocalId}
              onPress={() => handleNavigateTrip(previousTripLocalId)}
              style={[styles.routeTripNavButton, !previousTripLocalId && styles.routeTripNavButtonDisabled]}
            >
              <MaterialIcons color={previousTripLocalId ? "#243224" : "#9aa596"} name="chevron-left" size={24} />
            </Pressable>
            <Pressable
              onPress={() => setDetailsSheetVisible(true)}
              style={styles.routeBottomTitleButton}
            >
              <Text numberOfLines={1} style={styles.routeBottomTitle}>
                {selectedTrip.title}
              </Text>
              <View style={styles.routeBottomMetaWrap}>
                <Text style={styles.routeBottomMeta}>{distanceText}</Text>
                <MaterialIcons color="#243224" name="expand-less" size={20} />
              </View>
            </Pressable>
            <Pressable
              accessibilityLabel="Next trip"
              disabled={!nextTripLocalId}
              onPress={() => handleNavigateTrip(nextTripLocalId)}
              style={[styles.routeTripNavButton, !nextTripLocalId && styles.routeTripNavButtonDisabled]}
            >
              <MaterialIcons color={nextTripLocalId ? "#243224" : "#9aa596"} name="chevron-right" size={24} />
            </Pressable>
          </View>
        </View>
        {rawReprocessBusy ? (
          <View style={styles.rawReprocessProcessingOverlay}>
            <View style={styles.rawReprocessProcessingCard}>
              <ActivityIndicator color="#fffdf8" size="small" />
              <View style={styles.rawReprocessProcessingTextBlock}>
                <Text style={styles.rawReprocessProcessingTitle}>
                  {rawReprocessUndoAvailable ? "Restoring route" : "Reprocessing route"}
                </Text>
                <Text style={styles.rawReprocessProcessingText}>Processing, please wait...</Text>
              </View>
            </View>
          </View>
        ) : null}
        {rawReprocessUndoBannerVisible && rawReprocessUndoAvailable ? (
          <View style={styles.rawReprocessUndoBanner}>
            <View style={styles.rawReprocessUndoTextBlock}>
              <Text style={styles.rawReprocessUndoTitle}>Route reprocessed</Text>
              <Text numberOfLines={1} style={styles.rawReprocessUndoText}>
                Review the map and undo if the result is worse.
              </Text>
            </View>
            <Pressable
              disabled={rawReprocessBusy}
              onPress={handleUndoRawReprocessing}
              style={[styles.rawReprocessUndoButton, rawReprocessBusy && styles.rawReprocessUndoButtonDisabled]}
            >
              <Text style={styles.rawReprocessUndoButtonText}>Undo</Text>
            </Pressable>
            <Pressable
              disabled={rawReprocessBusy}
              onPress={() => void handleKeepRawReprocessing()}
              style={[styles.rawReprocessKeepButton, rawReprocessBusy && styles.rawReprocessUndoButtonDisabled]}
            >
              <Text style={styles.rawReprocessKeepButtonText}>Keep</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
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
  routeMapShell: {
    flex: 1,
    position: "relative",
  },
  routeMapOverlay: {
    position: "absolute",
    top: 14,
    left: 14,
    right: 14,
    alignItems: "flex-start",
  },
  routeBottomBarWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 16,
  },
  routeBottomBar: {
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: "rgba(255, 253, 248, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(235, 225, 207, 0.9)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#142014",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
  },
  routeTripNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(230, 236, 225, 0.9)",
  },
  routeTripNavButtonDisabled: {
    opacity: 0.42,
  },
  routeBottomTitleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  routeBottomTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#243224",
  },
  routeBottomMetaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  routeBottomMeta: {
    fontSize: 13,
    fontWeight: "700",
    color: "#52624f",
  },
  routeDetailsOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(20, 28, 20, 0.28)",
  },
  routeDetailsBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  routeDetailsSheet: {
    width: "100%",
    maxHeight: "82%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "rgba(248, 244, 234, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(235, 225, 207, 0.92)",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    shadowColor: "#142014",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  routeDetailsHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(82, 98, 79, 0.35)",
    marginBottom: 12,
  },
  routeDetailsTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#243224",
    marginBottom: 2,
  },
  routeDetailsBody: {
    gap: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  tripActionToolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  tripDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: "#4f5f4f",
  },
  headerIconButtonDisabled: {
    opacity: 0.72,
  },
  mapTypeRow: {
    flexDirection: "row",
    gap: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 253, 248, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(235, 225, 207, 0.88)",
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: "#142014",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  syncButton: {
    backgroundColor: "#e6ece1",
  },
  shareButton: {
    backgroundColor: "#dfead9",
  },
  reprocessButton: {
    backgroundColor: "#e8edf5",
  },
  reprocessUndoButton: {
    backgroundColor: "#f4ead8",
  },
  rawReprocessUndoBanner: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#243224",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#142014",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  rawReprocessUndoTextBlock: {
    flex: 1,
    gap: 2,
  },
  rawReprocessUndoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  rawReprocessUndoText: {
    fontSize: 13,
    color: "#dbe6d5",
  },
  rawReprocessUndoButton: {
    borderRadius: 999,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  rawReprocessProcessingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(20, 32, 20, 0.18)",
  },
  rawReprocessProcessingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    backgroundColor: "rgba(36, 50, 36, 0.94)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#142014",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  rawReprocessProcessingTextBlock: {
    gap: 2,
  },
  rawReprocessProcessingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fffdf8",
  },
  rawReprocessProcessingText: {
    fontSize: 13,
    color: "#dbe6d5",
  },
  rawReprocessUndoButtonDisabled: {
    opacity: 0.6,
  },
  rawReprocessUndoButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  rawReprocessKeepButton: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 253, 248, 0.14)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  rawReprocessKeepButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  demoHint: {
    fontSize: 13,
    lineHeight: 18,
    color: "#60705d",
  },
  premiumHint: {
    borderRadius: 12,
    backgroundColor: "#fff4d7",
    color: "#81560f",
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  shareSuccessText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2f6c42",
  },
  mapTypeChip: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  mapTypeChipSelected: {
    backgroundColor: "#243224",
  },
  mapTypeChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#355035",
  },
  mapTypeChipTextSelected: {
    color: "#fffdf8",
  },
  routeLoadingCard: {
    flex: 1,
    minHeight: 320,
    borderRadius: 20,
    backgroundColor: "#dfe8db",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  routeLoadingTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#355035",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  routeLoadingText: {
    fontSize: 13,
    color: "#52624f",
  },
  summaryGrid: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  summaryItem: {
    flex: 1,
    gap: 2,
  },
  batteryConsumptionItem: {
    gap: 2,
    borderRadius: 14,
    backgroundColor: "#eef4ea",
    borderWidth: 1,
    borderColor: "#dbe7d5",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  batteryConsumptionMeta: {
    fontSize: 12,
    color: "#52624f",
  },
  summaryKey: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#76856f",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#243224",
  },
  segmentsList: {
    borderRadius: 16,
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    padding: 14,
    gap: 12,
  },
  segmentsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#243224",
  },
  segmentsScroll: {
    maxHeight: 205,
  },
  segmentRow: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: "#ece4d4",
    paddingTop: 12,
  },
  segmentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  segmentHeaderLead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  segmentMode: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  segmentEditIconButton: {
    borderRadius: 999,
    backgroundColor: "#eef2ea",
    padding: 6,
  },
  segmentDistance: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  pauseRow: {
    backgroundColor: "#fbf7ef",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  pauseMode: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8a6d3b",
  },
  pauseDuration: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8a6d3b",
  },
  segmentMeta: {
    fontSize: 13,
    color: "#52624f",
  },
  segmentEditOverlay: {
    flex: 1,
    backgroundColor: "rgba(22, 29, 22, 0.36)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  segmentEditCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    backgroundColor: "#fffdf8",
    padding: 20,
    gap: 14,
  },
  segmentEditTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#243224",
  },
  segmentEditSubtitle: {
    fontSize: 13,
    color: "#60705d",
  },
  segmentEditOptions: {
    gap: 8,
  },
  segmentEditOption: {
    borderRadius: 14,
    backgroundColor: "#eef2ea",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  segmentEditOptionSelected: {
    backgroundColor: "#243224",
  },
  segmentEditOptionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#355035",
  },
  segmentEditOptionTextSelected: {
    color: "#fffdf8",
  },
  segmentEditCancelButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  segmentEditCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#52624f",
  },
});
