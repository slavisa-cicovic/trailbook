import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import type { Trip, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import type { TripTimelineEntry } from "../../services/trip-pauses/trip-pauses.service";
import {
  buildSegmentPolylines,
  buildTripSegmentsSummary,
  finalizeEndedTripSegments,
  updateTripSegmentMode,
} from "../../services/trip-segments/trip-segments.service";
import { buildTripTimelineEntries } from "../../services/trip-pauses/trip-pauses.service";
import {
  getVisibleAttachmentsForWaypoints,
  getVisibleTrips,
  getVisibleWaypointsForTrip,
  type TripUpdateInput,
  updateTripMetadata,
} from "../../services/trips/trips-management.service";
import {
  formatDistanceKm,
} from "../../services/trip-points/trip-points.service";
import {
  applyRawEventReprocessing,
  previewRawEventReprocessing,
  type ReprocessingPreview,
} from "../../services/recording/raw-event-reprocessing.service";
import {
  loadTripPointsForTrip,
  loadTripSegmentStatsByTripLocalIds,
  replaceTripPointsForTrip,
  type TripSegmentStatsRow,
} from "../../repositories/trip-points-repository";
import { loadTripSegments } from "../../repositories/trip-segments-repository";
import { loadTrips } from "../../repositories/trips-repository";
import { loadWaypoints } from "../../repositories/waypoints-repository";
import { useSessionStore } from "../../state/session-store";
import { useTripPausesStore } from "../../state/trip-pauses-store";
import { setTripSegments, useTripSegmentsStore } from "../../state/trip-segments-store";
import { useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import { enqueueAndDrainTripSync } from "../../services/sync/sync-actions.service";
import { useShareTripMutation } from "../../features/sharing/hooks/mutations/use-share-trip-mutation";
import { useTripShares, useShareRecipients } from "../../features/sharing/hooks/queries/use-trip-shares";
import TripEditModal from "./components/trip-edit-modal";
import TripShareModal from "./components/trip-share-modal";
import SegmentEditModal from "./components/segment-edit-modal";
import TripRouteMap, { type TrailbookMapType } from "./components/trip-route-map";

const mapTypeOptions: { label: string; value: TrailbookMapType }[] = [
  { label: "Map", value: "standard" },
  { label: "Satellite", value: "satellite" },
  { label: "Hybrid", value: "hybrid" },
];

type EditableMode = "bike" | "boat" | "drive" | "plane" | "walk";

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

function formatRawReprocessingPreview(preview: ReprocessingPreview): string {
  const warnings = preview.warnings.length > 0
    ? `\n\nWarnings:\n${preview.warnings.map((warning) => `- ${warning}`).join("\n")}`
    : "";

  return [
    `Raw events: ${preview.rawEventCount}`,
    `Old: ${preview.oldPointCount} points, ${formatDistanceKm(preview.oldDistanceMeters)}, ${preview.oldSegmentCount} segments`,
    `New: ${preview.newPointCount} points, ${formatDistanceKm(preview.newDistanceMeters)}, ${preview.newSegmentCount} segments`,
    `Rejected raw: ${preview.rejectedRawEventCount}`,
    `Duplicate raw: ${preview.duplicateRawEventCount}`,
    warnings,
  ].join("\n");
}

function getDisplayTripSegments(tripSegments: TripSegment[], selectedTrip: Trip | null): TripSegment[] {
  if (!selectedTrip?.endedAt) {
    return tripSegments;
  }

  return tripSegments.map((segment) =>
    segment.tripLocalId === selectedTrip.localId && segment.endedAt === null
      ? {
          ...segment,
          endedAt: selectedTrip.endedAt,
        }
      : segment,
  );
}

export default function TripRouteScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string | string[] }>();
  const identitySession = useSessionStore((state) => state.identitySession);
  const featureFlags = useFeatureFlags();
  const trips = useTripsStore((state) => state.trips);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const tripPauses = useTripPausesStore((state) => state.tripPauses);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);
  const currentUserId = identitySession?.userId ?? null;

  const [tripEditVisible, setTripEditVisible] = useState(false);
  const [tripShareVisible, setTripShareVisible] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [mapType, setMapType] = useState<TrailbookMapType>("standard");
  const [shareRecipientEmail, setShareRecipientEmail] = useState("");
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [resolvedShareTripId, setResolvedShareTripId] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncIconRotation] = useState(() => new Animated.Value(0));
  const [rawReprocessBusy, setRawReprocessBusy] = useState(false);
  const [segmentEditSegmentId, setSegmentEditSegmentId] = useState<string | null>(null);
  const [tripSegmentStatsBySegmentId, setTripSegmentStatsBySegmentId] = useState<
    Map<string, TripSegmentStatsRow>
  >(new Map());
  const [selectedTripPoints, setSelectedTripPoints] = useState<TripPoint[]>([]);
  const [selectedTripPointsTripId, setSelectedTripPointsTripId] = useState<string | null>(null);
  const [routePointsLoading, setRoutePointsLoading] = useState(false);
  const [tripDraft, setTripDraft] = useState<TripUpdateInput>({
    title: "",
    description: "",
  });

  const sharesQuery = useTripShares(resolvedShareTripId, tripShareVisible);
  const recipientsQuery = useShareRecipients(tripShareVisible);
  const shareMutation = useShareTripMutation(resolvedShareTripId);

  const resolvedTripId = Array.isArray(tripId) ? tripId[0] : tripId;
  const currentUserTrips = useMemo(
    () => (currentUserId ? trips.filter((trip) => trip.userId === currentUserId) : []),
    [currentUserId, trips],
  );
  const currentUserTripSegments = useMemo(
    () => (currentUserId ? tripSegments.filter((segment) => segment.userId === currentUserId) : []),
    [currentUserId, tripSegments],
  );
  const currentUserTripPauses = useMemo(
    () => (currentUserId ? tripPauses.filter((tripPause) => tripPause.userId === currentUserId) : []),
    [currentUserId, tripPauses],
  );
  const currentUserWaypoints = useMemo(
    () => (currentUserId ? waypoints.filter((waypoint) => waypoint.userId === currentUserId) : []),
    [currentUserId, waypoints],
  );
  const currentUserWaypointAttachments = useMemo(
    () => (currentUserId ? waypointAttachments.filter((attachment) => attachment.userId === currentUserId) : []),
    [currentUserId, waypointAttachments],
  );

  const visibleTrips = getVisibleTrips(currentUserTrips);
  const selectedTrip = visibleTrips.find((trip) => trip.localId === resolvedTripId) ?? null;
  const selectedTripLocalId = selectedTrip?.localId ?? null;
  const selectedTripEndedAt = selectedTrip?.endedAt ?? null;
  const loadedSelectedTripPoints =
    selectedTripLocalId && selectedTripPointsTripId === selectedTripLocalId ? selectedTripPoints : [];
  const routeLoading = Boolean(selectedTrip && (routePointsLoading || selectedTripPointsTripId !== selectedTrip.localId));
  const displayTripSegments = getDisplayTripSegments(currentUserTripSegments, selectedTrip);
  const selectedTripSegments = selectedTrip
    ? buildTripSegmentsSummary(
        displayTripSegments,
        loadedSelectedTripPoints,
        selectedTrip.localId,
        tripSegmentStatsBySegmentId,
      )
    : [];
  const selectedTripPauses = selectedTrip
    ? currentUserTripPauses.filter((tripPause) => tripPause.tripLocalId === selectedTrip.localId)
    : [];
  const selectedTripTimeline: TripTimelineEntry[] = selectedTrip
    ? buildTripTimelineEntries(selectedTripSegments, selectedTripPauses, new Date().toISOString())
    : [];
  const selectedTripWaypoints = selectedTripLocalId
    ? getVisibleWaypointsForTrip(currentUserWaypoints, selectedTripLocalId)
    : [];
  const selectedTripAttachments = selectedTripLocalId
    ? getVisibleAttachmentsForWaypoints(
        currentUserWaypointAttachments,
        selectedTripWaypoints.map((waypoint) => waypoint.localId),
      )
    : [];
  const routeCoordinates = loadedSelectedTripPoints.map((tripPoint) => ({
    latitude: tripPoint.latitude,
    longitude: tripPoint.longitude,
  }));
  const segmentPolylines = selectedTrip
    ? buildSegmentPolylines(displayTripSegments, loadedSelectedTripPoints, selectedTrip.localId)
    : [];
  const fallbackCoordinates = selectedTripWaypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
  }));
  const selectedTripMapRegion = buildTripMapRegion(
    routeCoordinates.length > 0 ? routeCoordinates : fallbackCoordinates,
  );

  const firstPhotoUriByWaypointId = new Map<string, string>();

  for (const attachment of selectedTripAttachments) {
    if (!firstPhotoUriByWaypointId.has(attachment.waypointLocalId)) {
      firstPhotoUriByWaypointId.set(attachment.waypointLocalId, attachment.localUri);
    }
  }

  const waypointMarkers = selectedTripWaypoints.map((waypoint) => ({
    firstPhotoUri: firstPhotoUriByWaypointId.get(waypoint.localId) ?? null,
    waypoint,
    hasPhotos: firstPhotoUriByWaypointId.has(waypoint.localId),
  }));

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

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedTripPoints() {
      if (!selectedTripLocalId) {
        setSelectedTripPoints([]);
        setSelectedTripPointsTripId(null);
        setRoutePointsLoading(false);
        return;
      }

      setSelectedTripPoints([]);
      setSelectedTripPointsTripId(null);
      setRoutePointsLoading(true);

      try {
        const tripPoints = await loadTripPointsForTrip(selectedTripLocalId);

        if (!cancelled) {
          setSelectedTripPoints(tripPoints);
          setSelectedTripPointsTripId(selectedTripLocalId);
        }
      } finally {
        if (!cancelled) {
          setRoutePointsLoading(false);
        }
      }
    }

    void loadSelectedTripPoints();

    return () => {
      cancelled = true;
    };
  }, [selectedTripLocalId]);

  useEffect(() => {
    if (
      !selectedTripLocalId ||
      !selectedTripEndedAt ||
      routePointsLoading ||
      selectedTripPointsTripId !== selectedTripLocalId ||
      currentUserTripSegments.every(
        (segment) => segment.tripLocalId !== selectedTripLocalId || segment.endedAt !== null,
      )
    ) {
      return;
    }

    const tripPointsForFinalization =
      selectedTripPointsTripId === selectedTripLocalId ? selectedTripPoints : [];
    const finalizedTripSegments = finalizeEndedTripSegments(
      tripSegments,
      tripPointsForFinalization,
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
    routePointsLoading,
    selectedTripEndedAt,
    selectedTripLocalId,
    selectedTripPoints,
    selectedTripPointsTripId,
    tripSegments,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadSegmentStats() {
      if (!selectedTripLocalId) {
        setTripSegmentStatsBySegmentId(new Map());
        return;
      }

      const nextStats = await loadTripSegmentStatsByTripLocalIds([selectedTripLocalId]);

      if (!cancelled) {
        setTripSegmentStatsBySegmentId(nextStats);
      }
    }

    void loadSegmentStats();

    return () => {
      cancelled = true;
    };
  }, [selectedTripLocalId]);

  async function syncSelectedTripIfNeeded() {
    if (!identitySession?.sessionToken || !selectedTrip) {
      throw new Error("You must be signed in to sync this trip.");
    }

    setSyncBusy(true);

    try {
      const drainResult = await enqueueAndDrainTripSync({
        identitySession,
        tripLocalId: selectedTrip.localId,
      });
      const syncedTrip = drainResult.trips?.find((trip) => trip.localId === selectedTrip.localId);
      const serverId = syncedTrip?.serverId ?? selectedTrip.serverId;

      if (!serverId) {
        throw new Error("Trip sync did not return a server id.");
      }

      return serverId;
    } finally {
      setSyncBusy(false);
    }
  }

  async function loadSelectedTripPointsForEdit(): Promise<TripPoint[]> {
    if (!selectedTrip) {
      return [];
    }

    if (selectedTripPointsTripId === selectedTrip.localId) {
      return loadedSelectedTripPoints;
    }

    const tripPoints = await loadTripPointsForTrip(selectedTrip.localId);
    setSelectedTripPoints(tripPoints);
    setSelectedTripPointsTripId(selectedTrip.localId);

    return tripPoints;
  }

  async function refreshSelectedTripSegmentStats(tripLocalId: string): Promise<void> {
    setTripSegmentStatsBySegmentId(await loadTripSegmentStatsByTripLocalIds([tripLocalId]));
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

  async function handleUpdateSegmentMode(nextMode: EditableMode) {
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
        nextMode,
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
      setSelectedTripPoints(nextSelectedTripPoints);
      setSelectedTripPointsTripId(selectedTrip.localId);
      await refreshSelectedTripSegmentStats(selectedTrip.localId);
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

      setSegmentEditSegmentId(null);
    } catch (error) {
      Alert.alert(
        "Segment update failed",
        error instanceof Error ? error.message : "Unable to update this segment mode.",
      );
    }
  }

  async function handleApplyRawReprocessing() {
    if (!selectedTrip || !currentUserId || selectedTrip.status !== "ended") {
      return;
    }

    setRawReprocessBusy(true);

    try {
      const result = await applyRawEventReprocessing(selectedTrip.localId);
      const [nextTrips, nextTripSegments, nextWaypoints, nextTripPoints] = await Promise.all([
        loadTrips(),
        loadTripSegments(),
        loadWaypoints(),
        loadTripPointsForTrip(selectedTrip.localId),
      ]);

      await setTrips(nextTrips);
      await setTripSegments(nextTripSegments);
      await setWaypoints(nextWaypoints);
      setSelectedTripPoints(nextTripPoints);
      setSelectedTripPointsTripId(selectedTrip.localId);
      await refreshSelectedTripSegmentStats(selectedTrip.localId);
      Alert.alert(
        "Route reprocessed",
        `Rebuilt route from raw events: ${result.newPointCount} points, ${formatDistanceKm(result.newDistanceMeters)}.`,
      );
    } catch (error) {
      Alert.alert(
        "Raw reprocessing failed",
        error instanceof Error ? error.message : "Unable to reprocess this route from raw events.",
      );
    } finally {
      setRawReprocessBusy(false);
    }
  }

  async function handlePreviewRawReprocessing() {
    if (!selectedTrip || !currentUserId || selectedTrip.status !== "ended") {
      return;
    }

    setRawReprocessBusy(true);

    try {
      const preview = await previewRawEventReprocessing(selectedTrip.localId);

      Alert.alert(
        "Reprocess route from raw GPS",
        formatRawReprocessingPreview(preview),
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Apply",
            style: "destructive",
            onPress: () => {
              void handleApplyRawReprocessing();
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Raw reprocessing unavailable",
        error instanceof Error ? error.message : "Unable to preview raw reprocessing for this route.",
      );
    } finally {
      setRawReprocessBusy(false);
    }
  }

  function handleSelectWaypoint(waypoint: Waypoint) {
    if (!selectedTrip) {
      return;
    }

    router.push(`/trips/${selectedTrip.localId}/waypoints/${waypoint.localId}`);
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
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
        onSelectMode={(mode) => void handleUpdateSegmentMode(mode)}
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

      <View style={styles.detailsAccordionCard}>
        <Pressable
          onPress={() => setDetailsExpanded((current) => !current)}
          style={styles.detailsAccordionTrigger}
        >
          <Text numberOfLines={1} style={styles.tripTitle}>
            {selectedTrip.title}
          </Text>
          <View style={styles.detailsAccordionActions}>
            <MaterialIcons
              color="#243224"
              name={detailsExpanded ? "expand-less" : "expand-more"}
              size={22}
            />
          </View>
        </Pressable>

        {detailsExpanded ? (
          <View style={styles.detailsAccordionBody}>
            <View style={styles.tripActionToolbar}>
              <IconButton
                accessibilityLabel="Edit trip"
                icon="edit"
                onPress={() => openTripEdit(selectedTrip)}
              />
              {selectedTrip.status === "ended" &&
              identitySession.mode === "authenticated" &&
              featureFlags.rawEventReprocessingEnabled ? (
                <IconButton
                  accessibilityLabel={rawReprocessBusy ? "Reprocessing route" : "Reprocess route"}
                  disabled={rawReprocessBusy}
                  disabledIconColor="#6b7280"
                  icon="replay"
                  onPress={() => void handlePreviewRawReprocessing()}
                  style={[styles.reprocessButton, rawReprocessBusy && styles.headerIconButtonDisabled]}
                />
              ) : null}
              {identitySession.mode === "authenticated" ? (
                <>
                  <IconButton
                    accessibilityLabel={syncBusy ? "Syncing trip" : "Sync trip"}
                    disabled={syncBusy}
                    onPress={() => void syncSelectedTripIfNeeded()}
                    style={[styles.syncButton, syncBusy && styles.headerIconButtonDisabled]}
                  >
                    <Animated.View style={syncIconAnimatedStyle}>
                      <MaterialIcons color={syncIconColor} name="sync" size={18} />
                    </Animated.View>
                  </IconButton>
                  <IconButton
                    accessibilityLabel="Share trip"
                    icon="share"
                    onPress={() => {
                      void openTripShare();
                    }}
                    style={styles.shareButton}
                  />
                </>
              ) : null}
            </View>
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
                            <Text style={styles.segmentMode}>{getRecordingProfileLabel(entry.segment.recordingProfile)}</Text>
                            {selectedTrip.status === "ended" ? (
                              <Pressable
                                onPress={() => setSegmentEditSegmentId(entry.segment.localId)}
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
          </View>
        ) : null}
      </View>

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
          segmentPolylines={segmentPolylines}
          waypointMarkers={waypointMarkers}
        />
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    gap: 12,
    paddingBottom: 12,
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
  detailsAccordionCard: {
    borderRadius: 20,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    padding: 16,
  },
  detailsAccordionTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  detailsAccordionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  detailsAccordionBody: {
    gap: 14,
    paddingTop: 14,
  },
  tripActionToolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  tripTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#243224",
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
    gap: 8,
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
  demoHint: {
    fontSize: 13,
    lineHeight: 18,
    color: "#60705d",
  },
  shareSuccessText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2f6c42",
  },
  mapTypeChip: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mapTypeChipSelected: {
    backgroundColor: "#243224",
  },
  mapTypeChipText: {
    fontSize: 13,
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
