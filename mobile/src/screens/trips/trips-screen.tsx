import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import ScreenLayout from "../../components/layout/screen-layout";
import type { SharedTripSummary } from "../../domain/shared-trips";
import type { Trip } from "../../domain/trips";
import {
  buildTripModeSummary,
  getOpenTripSegmentForTrip,
  getVisibleTripSegmentsForTrip,
} from "../../services/trip-segments/trip-segments.service";
import {
  buildTripsAggregateSummary,
  buildTripSummaryWithPoints,
  filterTripsByDate,
  formatDurationSummary,
  getVisibleTrips,
  markTripDeleted,
  restoreTripDeletedState,
  type TripDateFilter,
  updateTripMetadata,
  type TripUpdateInput,
} from "../../services/trips/trips-management.service";
import {
  createResumedRecordingState,
  resumePausedTrip,
  stopRecordingSession,
} from "../../services/recording/recording.service";
import { setRecordingSession, useRecordingStore } from "../../state/recording-store";
import { useSessionStore } from "../../state/session-store";
import { setTripPauses, useTripPausesStore } from "../../state/trip-pauses-store";
import { setTripSegments, useTripSegmentsStore } from "../../state/trip-segments-store";
import { setWaypointAttachments, useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import { formatDistanceKm } from "../../services/trip-points/trip-points.service";
import {
  listSharedTrips,
  syncTripToServer,
  uploadTripAttachmentToServer,
} from "../../services/trips/server-trip-sharing.service";
import { loadTripPointsForTrip, loadTripStatsByTripLocalIds, type TripStatsRow } from "../../storage/trip-points-storage";
import TripEditModal from "./components/trip-edit-modal";

interface PendingUndoState {
  tripLocalId: string;
  tripTitle: string;
}

type TripListMode = "owned" | "shared";

const TRIP_DATE_FILTER_OPTIONS: Array<{ label: string; value: TripDateFilter }> = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_week", label: "Last week" },
  { value: "last_month", label: "Last month" },
  { value: "last_year", label: "Last year" },
];

export default function TripsScreen() {
  const router = useRouter();
  const suppressTapUntilRef = useRef(0);
  const identitySession = useSessionStore((state) => state.identitySession);
  const recordingSession = useRecordingStore((state) => state.session);
  const trips = useTripsStore((state) => state.trips);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const tripPauses = useTripPausesStore((state) => state.tripPauses);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [pendingUndo, setPendingUndo] = useState<PendingUndoState | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripEditVisible, setTripEditVisible] = useState(false);
  const [dateFilter, setDateFilter] = useState<TripDateFilter>("all");
  const [listMode, setListMode] = useState<TripListMode>("owned");
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [sharedTrips, setSharedTrips] = useState<SharedTripSummary[]>([]);
  const [sharedTripsLoading, setSharedTripsLoading] = useState(false);
  const [sharedTripsError, setSharedTripsError] = useState<string | null>(null);
  const [syncingTripId, setSyncingTripId] = useState<string | null>(null);
  const [tripStatsByTripId, setTripStatsByTripId] = useState<Map<string, TripStatsRow>>(new Map());
  const [tripStatsLoading, setTripStatsLoading] = useState(false);
  const [tripDraft, setTripDraft] = useState<TripUpdateInput>({
    title: "",
    description: "",
  });

  const currentUserTrips = identitySession
    ? trips.filter((trip) => trip.userId === identitySession.userId)
    : [];
  const currentUserTripSegments = identitySession
    ? tripSegments.filter((segment) => segment.userId === identitySession.userId)
    : [];
  const currentUserWaypoints = identitySession
    ? waypoints.filter((waypoint) => waypoint.userId === identitySession.userId)
    : [];
  const currentUserWaypointAttachments = identitySession
    ? waypointAttachments.filter((attachment) => attachment.userId === identitySession.userId)
    : [];

  const visibleTrips = getVisibleTrips(currentUserTrips);
  const filteredTrips = filterTripsByDate(visibleTrips, dateFilter);
  const filteredTripIds = filteredTrips.map((trip) => trip.localId);
  const filteredTripIdsKey = filteredTripIds.join("|");
  const hasMissingTripStats = filteredTripIds.some((tripLocalId) => !tripStatsByTripId.has(tripLocalId));
  const showTripStatsSkeleton = filteredTripIds.length > 0 && (tripStatsLoading || hasMissingTripStats);
  const tripSummaries = filteredTrips.map((trip) => ({
    ...buildTripSummaryWithPoints(trip, [], currentUserWaypoints, currentUserWaypointAttachments),
    distanceMeters: tripStatsByTripId.get(trip.localId)?.distance_meters ?? null,
  }));
  const tripsAggregateSummary = filteredTrips.reduce(
    (summary, trip) => {
      const distanceMeters = tripStatsByTripId.get(trip.localId)?.distance_meters ?? 0;
      const durationMs = Math.max(
        0,
        new Date(trip.endedAt ?? new Date().toISOString()).getTime() - new Date(trip.startedAt).getTime(),
      );

      summary.totalTripCount += 1;
      summary.totalDurationMs += durationMs;
      summary.totalDistanceMeters += distanceMeters;

      if (trip.recordingProfile === "drive") {
        summary.driveTripCount += 1;
        summary.driveDurationMs += durationMs;
        summary.driveDistanceMeters += distanceMeters;
      } else if (trip.recordingProfile === "boat") {
        summary.boatTripCount += 1;
        summary.boatDurationMs += durationMs;
        summary.boatDistanceMeters += distanceMeters;
      } else if (trip.recordingProfile === "plane") {
        summary.planeTripCount += 1;
        summary.planeDurationMs += durationMs;
        summary.planeDistanceMeters += distanceMeters;
      } else if (trip.recordingProfile === "bike") {
        summary.bikeTripCount += 1;
        summary.bikeDurationMs += durationMs;
        summary.bikeDistanceMeters += distanceMeters;
      } else {
        summary.walkTripCount += 1;
        summary.walkDurationMs += durationMs;
        summary.walkDistanceMeters += distanceMeters;
      }

      return summary;
    },
    buildTripsAggregateSummary([], []),
  );
  const summaryRows = [
    {
      label: "Walk",
      distanceMeters: tripsAggregateSummary.walkDistanceMeters,
      durationMs: tripsAggregateSummary.walkDurationMs,
      tripCount: tripsAggregateSummary.walkTripCount,
    },
    {
      label: "Bike",
      distanceMeters: tripsAggregateSummary.bikeDistanceMeters,
      durationMs: tripsAggregateSummary.bikeDurationMs,
      tripCount: tripsAggregateSummary.bikeTripCount,
    },
    {
      label: "Drive",
      distanceMeters: tripsAggregateSummary.driveDistanceMeters,
      durationMs: tripsAggregateSummary.driveDurationMs,
      tripCount: tripsAggregateSummary.driveTripCount,
    },
    {
      label: "Boat",
      distanceMeters: tripsAggregateSummary.boatDistanceMeters,
      durationMs: tripsAggregateSummary.boatDurationMs,
      tripCount: tripsAggregateSummary.boatTripCount,
    },
    {
      label: "Plane",
      distanceMeters: tripsAggregateSummary.planeDistanceMeters,
      durationMs: tripsAggregateSummary.planeDurationMs,
      tripCount: tripsAggregateSummary.planeTripCount,
    },
  ].filter((row) => row.distanceMeters > 0 || row.durationMs > 0);
  const selectedTrip = visibleTrips.find((trip) => trip.localId === selectedTripId) ?? null;

  useEffect(() => {
    if (!pendingUndo) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setPendingUndo(null);
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [pendingUndo]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadTripStats() {
        if (filteredTripIds.length === 0) {
          setTripStatsByTripId(new Map());
          setTripStatsLoading(false);
          return;
        }

        setTripStatsLoading(true);

        try {
          const nextTripStatsByTripId = await loadTripStatsByTripLocalIds(filteredTripIds);

          if (!cancelled) {
            setTripStatsByTripId(nextTripStatsByTripId);
          }
        } finally {
          if (!cancelled) {
            setTripStatsLoading(false);
          }
        }
      }

      void loadTripStats();

      return () => {
        cancelled = true;
      };
    }, [filteredTripIdsKey]),
  );

  useEffect(() => {
    if (listMode !== "shared" || identitySession?.mode !== "authenticated" || !identitySession.sessionToken) {
      return;
    }

    void refreshSharedTrips();
  }, [identitySession?.mode, identitySession?.sessionToken, listMode]);

  async function refreshSharedTrips() {
    if (!identitySession?.sessionToken) {
      return;
    }

    setSharedTripsLoading(true);
    setSharedTripsError(null);

    try {
      const response = await listSharedTrips(identitySession.sessionToken);
      setSharedTrips(response.sharedTrips);
    } catch (error) {
      setSharedTripsError(error instanceof Error ? error.message : "Unable to load shared trips.");
    } finally {
      setSharedTripsLoading(false);
    }
  }

  async function syncTripMutationToServer(
    tripLocalId: string,
    nextTrips: Trip[],
    nextWaypoints = waypoints,
    nextAttachments = waypointAttachments,
  ) {
    if (identitySession?.mode !== "authenticated" || !identitySession.sessionToken) {
      return;
    }

    const trip = nextTrips.find((candidate) => candidate.localId === tripLocalId);

    if (!trip) {
      return;
    }

    const tripWaypoints = nextWaypoints.filter((waypoint) => waypoint.tripLocalId === tripLocalId);
    const tripWaypointIds = new Set(tripWaypoints.map((waypoint) => waypoint.localId));
    const tripAttachments = nextAttachments.filter((attachment) =>
      tripWaypointIds.has(attachment.waypointLocalId),
    );

    await syncTripToServer(identitySession.sessionToken, {
      attachments: tripAttachments,
      trip,
      tripPoints: await loadTripPointsForTrip(tripLocalId),
      tripSegments: currentUserTripSegments.filter((segment) => segment.tripLocalId === tripLocalId),
      waypoints: tripWaypoints,
    });
  }

  async function handleSyncTrip(trip: Trip) {
    if (identitySession?.mode !== "authenticated" || !identitySession.sessionToken || syncingTripId) {
      return;
    }

    if (trip.status !== "ended") {
      return;
    }

    setSyncingTripId(trip.localId);

    try {
      const tripWaypoints = currentUserWaypoints.filter((waypoint) => waypoint.tripLocalId === trip.localId);
      const tripWaypointIds = new Set(tripWaypoints.map((waypoint) => waypoint.localId));
      const tripAttachments = currentUserWaypointAttachments.filter((attachment) =>
        tripWaypointIds.has(attachment.waypointLocalId),
      );
      const response = await syncTripToServer(identitySession.sessionToken, {
        attachments: tripAttachments,
        trip,
        tripPoints: await loadTripPointsForTrip(trip.localId),
        tripSegments: currentUserTripSegments.filter((segment) => segment.tripLocalId === trip.localId),
        waypoints: tripWaypoints,
      });
      const uploadedAttachments = [];
      const attachmentsToUpload = tripAttachments.filter(
        (attachment) =>
          attachment.deletedAt === null &&
          (!attachment.serverId ||
            attachment.syncStatus !== "synced" ||
            !attachment.localUri.startsWith("http")),
      );

      for (const attachment of attachmentsToUpload) {
        const uploadedAttachment = await uploadTripAttachmentToServer(identitySession.sessionToken, response.tripId, {
          attachmentLocalId: attachment.localId,
          localUri: attachment.localUri,
          mimeType: attachment.mimeType,
        });

        uploadedAttachments.push(uploadedAttachment);
      }

      await setTrips(
        trips.map((candidate) =>
          candidate.localId === trip.localId
            ? {
                ...candidate,
                serverId: response.tripId,
                syncStatus: "synced",
                updatedAt: response.syncedAt,
              }
            : candidate,
        ),
      );

      if (uploadedAttachments.length > 0) {
        const uploadedAttachmentIds = new Map(
          uploadedAttachments.map((attachment) => [attachment.attachmentLocalId, attachment.attachmentId]),
        );

        await setWaypointAttachments(
          waypointAttachments.map((attachment) =>
            uploadedAttachmentIds.has(attachment.localId)
              ? {
                  ...attachment,
                  serverId: uploadedAttachmentIds.get(attachment.localId) ?? attachment.serverId,
                  syncStatus: "synced",
                  updatedAt: response.syncedAt,
                }
              : attachment,
          ),
        );
      }
    } catch (error) {
      await setTrips(
        trips.map((candidate) =>
          candidate.localId === trip.localId
            ? {
                ...candidate,
                syncStatus: "sync-error",
                updatedAt: new Date().toISOString(),
              }
            : candidate,
        ),
      );
      Alert.alert("Sync failed", error instanceof Error ? error.message : "Trip could not be synced.");
    } finally {
      setSyncingTripId(null);
    }
  }

  async function handleDeleteTrip(trip: Trip) {
    if (trip.status !== "ended") {
      Alert.alert("Open trip", "Stop the route before deleting it.");
      return;
    }

    const deletedAt = new Date().toISOString();
    const nextState = markTripDeleted(trips, waypoints, waypointAttachments, trip.localId, deletedAt);

    await setTrips(nextState.trips);
    await setWaypoints(nextState.waypoints);
    await setWaypointAttachments(nextState.attachments);

    if (recordingSession.activeTripId === trip.localId) {
      await setRecordingSession(stopRecordingSession(recordingSession));
    }

    try {
      await syncTripMutationToServer(trip.localId, nextState.trips, nextState.waypoints, nextState.attachments);
    } catch (error) {
      Alert.alert(
        "Delete sync failed",
        error instanceof Error ? error.message : "Trip was deleted locally but could not be synced to the server.",
      );
    }

    setPendingUndo({
      tripLocalId: trip.localId,
      tripTitle: trip.title,
    });
    if (selectedTripId === trip.localId) {
      setSelectedTripId(null);
      setTripEditVisible(false);
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

    try {
      await syncTripMutationToServer(
        pendingUndo.tripLocalId,
        nextState.trips,
        nextState.waypoints,
        nextState.attachments,
      );
    } catch (error) {
      Alert.alert(
        "Restore sync failed",
        error instanceof Error ? error.message : "Trip was restored locally but could not be synced to the server.",
      );
    }

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

  async function handleResumeTrip(trip: Trip) {
    if (!identitySession) {
      return;
    }

    if (
      currentUserTrips.some(
        (candidate) =>
          candidate.deletedAt === null && candidate.status === "active" && candidate.localId !== trip.localId,
      )
    ) {
      Alert.alert("Active trip", "Pause or stop the current active trip before resuming another one.");
      return;
    }

    if (trip.status === "paused") {
      const resumedAt = new Date().toISOString();
      const nextState = createResumedRecordingState(
        identitySession,
        trip,
        tripSegments,
        tripPauses,
        resumedAt,
      );

      await setTripSegments(nextState.tripSegments);
      await setTripPauses(nextState.tripPauses);
      await setTrips(resumePausedTrip(trips, trip.localId, resumedAt));
      await setRecordingSession(nextState.session);
      router.replace("/recording");
      return;
    }

    const activeSegment = getOpenTripSegmentForTrip(currentUserTripSegments, trip.localId);

    await setRecordingSession({
      status: "interrupted",
      activeTripId: trip.localId,
      activeSegmentId: activeSegment?.localId ?? null,
      startedAt: trip.startedAt,
      lastPointRecordedAt: null,
      interruptedAt: new Date().toISOString(),
      userId: trip.userId,
      userEmail: identitySession.userEmail,
      deviceId: trip.deviceId,
      recordingMode: activeSegment?.recordingProfile ?? trip.recordingProfile,
      recordingProfile: activeSegment?.recordingProfile ?? trip.recordingProfile,
      autoCandidateProfile: null,
      autoCandidateSince: null,
      motionActivityType: null,
      motionActivityConfidence: null,
      motionActivityRecordedAt: null,
      motionActivitySourcePlatform: null,
    });

    router.replace("/recording");
  }

  function handleTripCardPress(tripLocalId: string) {
    if (Date.now() < suppressTapUntilRef.current) {
      return;
    }

    router.push(`/trips/${tripLocalId}`);
  }

  function suppressTapAfterSwipe() {
    suppressTapUntilRef.current = Date.now() + 1200;
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenLayout
      accountEmail={identitySession.userEmail}
      accountMode={identitySession.mode}
      contentStyle={styles.screenContent}
      contentVariant="plain"
      scrollEnabled={false}
      showBottomNavigation
      title="Trips"
    >
      <TripEditModal
        draft={tripDraft}
        onChangeDescription={(description) => setTripDraft((current) => ({ ...current, description }))}
        onChangeTitle={(title) => setTripDraft((current) => ({ ...current, title }))}
        onClose={() => setTripEditVisible(false)}
        onSave={() => void handleSaveTripEdit()}
        visible={tripEditVisible}
      />

      <View style={styles.tripsRoot}>
        <Text style={styles.subtitle}>Your local recorded routes and saved trip content.</Text>

        <View style={styles.modeToggleRow}>
          <Pressable
            onPress={() => setListMode("owned")}
            style={[styles.modeToggleChip, listMode === "owned" && styles.modeToggleChipSelected]}
          >
            <Text
              style={[styles.modeToggleText, listMode === "owned" && styles.modeToggleTextSelected]}
            >
              My trips
            </Text>
          </Pressable>
          <Pressable
            disabled={identitySession.mode !== "authenticated"}
            onPress={() => setListMode("shared")}
            style={[
              styles.modeToggleChip,
              listMode === "shared" && styles.modeToggleChipSelected,
              identitySession.mode !== "authenticated" && styles.modeToggleChipDisabled,
            ]}
          >
            <Text
              style={[styles.modeToggleText, listMode === "shared" && styles.modeToggleTextSelected]}
            >
              Shared with me
            </Text>
          </Pressable>
        </View>

        {listMode === "owned" ? (
          <>
            <ScrollView
              contentContainerStyle={styles.filterRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
            >
              {TRIP_DATE_FILTER_OPTIONS.map((option) => {
                const selected = option.value === dateFilter;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setDateFilter(option.value)}
                    style={[styles.filterChip, selected && styles.filterChipSelected]}
                  >
                    <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.summaryTable}>
              <Pressable
                onPress={() => setSummaryExpanded((current) => !current)}
                style={styles.summaryCollapsedHeader}
              >
                <Text style={styles.summaryCollapsedTitle}>Total</Text>
                <View style={styles.summaryCollapsedValues}>
                  {showTripStatsSkeleton ? (
                    <View style={styles.summaryValueSkeleton} />
                  ) : (
                    <Text style={styles.summaryCollapsedValue}>
                      {formatDistanceKm(tripsAggregateSummary.totalDistanceMeters)}
                    </Text>
                  )}
                  <Text style={styles.summaryCollapsedValue}>
                    {formatDurationSummary(tripsAggregateSummary.totalDurationMs)}
                  </Text>
                </View>
                <View style={styles.summaryToggleIcon}>
                  <MaterialIcons
                    color="#52624f"
                    name={summaryExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                    size={22}
                  />
                </View>
              </Pressable>

              {summaryExpanded ? (
                <View>
                  <View style={[styles.summaryRow, styles.summaryHeaderRow]}>
                    <Text style={[styles.summaryHeaderCell, styles.summaryModeCell]}>Mode</Text>
                    <Text style={[styles.summaryHeaderCell, styles.summaryValueCell]}>km</Text>
                    <Text style={[styles.summaryHeaderCell, styles.summaryValueCell]}>time</Text>
                    <Text style={[styles.summaryHeaderCell, styles.summaryValueCell]}>Trips</Text>
                  </View>
                  {summaryRows.map((row) => (
                    <View key={row.label} style={styles.summaryRow}>
                      <Text style={[styles.summaryModeText, styles.summaryModeCell]}>{row.label}</Text>
                      {showTripStatsSkeleton ? (
                        <View style={[styles.summaryValueCell, styles.summarySkeletonCell]}>
                          <View style={styles.summaryValueSkeleton} />
                        </View>
                      ) : (
                        <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
                          {formatDistanceKm(row.distanceMeters)}
                        </Text>
                      )}
                      <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
                        {formatDurationSummary(row.durationMs)}
                      </Text>
                      <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
                        {String(row.tripCount)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            <ScrollView contentContainerStyle={styles.listScrollContent} style={styles.listScroll}>
              {tripSummaries.length === 0 ? (
                <Text style={styles.empty}>No trips match the selected date filter.</Text>
              ) : (
                <View style={styles.list}>
                  {tripSummaries.map(({ trip, waypointCount, photoCount, distanceMeters }) => {
                    const statusLabel =
                      trip.status === "active" ? "Active" : trip.status === "paused" ? "Paused" : trip.syncStatus;
                    const showStatusBadge =
                      trip.status !== "ended" || identitySession.mode === "authenticated";
                    const isSyncBadge = trip.status === "ended" && identitySession.mode === "authenticated";
                    const isTripSyncing = syncingTripId === trip.localId;
                    const tripModeSummary = buildTripModeSummary(currentUserTripSegments, trip.localId);
                    const tripSegmentsForCard = getVisibleTripSegmentsForTrip(currentUserTripSegments, trip.localId);
                    const tripDurationMs = Math.max(
                      0,
                      new Date(trip.endedAt ?? new Date().toISOString()).getTime() -
                        new Date(trip.startedAt).getTime(),
                    );
                    const tripDistanceLoading = !tripStatsByTripId.has(trip.localId);

                    return (
                      <Swipeable
                        key={trip.localId}
                        friction={2}
                        onSwipeableCloseStartDrag={suppressTapAfterSwipe}
                        onSwipeableOpenStartDrag={suppressTapAfterSwipe}
                        onSwipeableWillClose={suppressTapAfterSwipe}
                        onSwipeableWillOpen={suppressTapAfterSwipe}
                        overshootRight={false}
                        renderRightActions={() => (
                          <View style={styles.swipeActions}>
                            <Pressable
                              onPress={() => router.push(`/trips/${trip.localId}`)}
                              style={[styles.swipeAction, styles.openSwipeAction]}
                            >
                              <Text style={styles.swipeActionText}>Open</Text>
                            </Pressable>
                            {trip.status !== "ended" ? (
                              <Pressable
                                onPress={() => void handleResumeTrip(trip)}
                                style={[styles.swipeAction, styles.resumeSwipeAction]}
                              >
                                <Text style={[styles.swipeActionText, styles.resumeSwipeActionText]}>
                                  Resume
                                </Text>
                              </Pressable>
                            ) : (
                              <Pressable
                                onPress={() => void handleDeleteTrip(trip)}
                                style={[styles.swipeAction, styles.deleteSwipeAction]}
                              >
                                <Text style={[styles.swipeActionText, styles.deleteSwipeActionText]}>
                                  Delete
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      >
                        <View style={styles.tripCardRow}>
                          <View style={styles.tripCard}>
                            <Pressable
                              onPress={() => handleTripCardPress(trip.localId)}
                              style={styles.tripBodyPressable}
                            >
                              <View style={styles.tripHeader}>
                                <View style={styles.tripHeaderText}>
                                  <Text style={styles.tripTitle}>{trip.title}</Text>
                                  {trip.description ? (
                                    <Text style={styles.tripDescription}>{trip.description}</Text>
                                  ) : null}
                                </View>
                                {showStatusBadge ? (
                                  isSyncBadge ? (
                                    <Pressable
                                      accessibilityLabel={isTripSyncing ? "Syncing trip" : "Sync trip"}
                                      disabled={isTripSyncing || syncingTripId !== null}
                                      onPress={(event) => {
                                        event.stopPropagation();
                                        void handleSyncTrip(trip);
                                      }}
                                      style={[
                                        styles.tripBadge,
                                        styles.tripBadgePressable,
                                        isTripSyncing && styles.tripBadgeDisabled,
                                      ]}
                                    >
                                      {isTripSyncing ? <ActivityIndicator color="#355035" size="small" /> : null}
                                      <Text style={styles.tripBadgeText}>{isTripSyncing ? "syncing" : statusLabel}</Text>
                                    </Pressable>
                                  ) : (
                                    <View style={styles.tripBadge}>
                                      <Text style={styles.tripBadgeText}>{statusLabel}</Text>
                                    </View>
                                  )
                                ) : null}
                              </View>

                              <View style={styles.metaGrid}>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Mode</Text>
                                  <Text style={styles.metaValue}>{tripModeSummary}</Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Distance</Text>
                                  {tripDistanceLoading ? (
                                    <View style={styles.metaValueSkeleton} />
                                  ) : (
                                    <Text style={styles.metaValue}>
                                      {distanceMeters === null ? "" : formatDistanceKm(distanceMeters)}
                                    </Text>
                                  )}
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
                                  <Text style={styles.metaKey}>Segments</Text>
                                  <Text style={styles.metaValue}>{String(tripSegmentsForCard.length)}</Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Duration</Text>
                                  <Text style={styles.metaValue}>
                                    {formatDurationSummary(tripDurationMs)}
                                  </Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Started</Text>
                                  <Text style={styles.metaValue}>
                                    {new Date(trip.startedAt).toLocaleDateString()}
                                  </Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Ended</Text>
                                  <Text style={styles.metaValue}>
                                    {trip.endedAt
                                      ? new Date(trip.endedAt).toLocaleDateString()
                                      : trip.status === "paused"
                                        ? "Paused"
                                        : "Active"}
                                  </Text>
                                </View>
                              </View>
                            </Pressable>
                          </View>
                        </View>
                      </Swipeable>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </>
        ) : (
          <>
            <View style={styles.sharedHeaderRow}>
              <Pressable onPress={() => void refreshSharedTrips()} style={styles.sharedRefreshButton}>
                <Text style={styles.sharedRefreshButtonText}>
                  {sharedTripsLoading ? "Refreshing..." : "Refresh"}
                </Text>
              </Pressable>
            </View>

            {sharedTripsError ? <Text style={styles.sharedError}>{sharedTripsError}</Text> : null}

            <ScrollView contentContainerStyle={styles.listScrollContent} style={styles.listScroll}>
              {sharedTrips.length === 0 && !sharedTripsLoading ? (
                <Text style={styles.empty}>No trips have been shared with you yet.</Text>
              ) : (
                <View style={styles.list}>
                  {sharedTrips.map((sharedTrip) => (
                    <View key={sharedTrip.shareId} style={styles.tripCardRow}>
                      <View style={[styles.tripCard, styles.sharedTripCard]}>
                        <Pressable
                          onPress={() => router.push(`/trips/shared/${sharedTrip.shareId}`)}
                          style={styles.tripBodyPressable}
                        >
                          <View style={styles.tripHeader}>
                            <View style={styles.tripHeaderText}>
                              <Text style={styles.tripTitle}>{sharedTrip.trip.title}</Text>
                              <Text style={styles.tripDescription}>
                                Shared by {sharedTrip.owner.displayName}
                              </Text>
                            </View>
                            <View style={[styles.tripBadge, styles.sharedTripBadge]}>
                              <Text style={styles.tripBadgeText}>Read only</Text>
                            </View>
                          </View>

                          <View style={styles.metaGrid}>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Owner</Text>
                              <Text style={styles.metaValue}>{sharedTrip.owner.email}</Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Mode</Text>
                              <Text style={styles.metaValue}>
                                {sharedTrip.trip.segmentCount > 1 ? "Mixed" : sharedTrip.trip.recordingProfile}
                              </Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Waypoints</Text>
                              <Text style={styles.metaValue}>{String(sharedTrip.trip.waypointCount)}</Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Segments</Text>
                              <Text style={styles.metaValue}>{String(sharedTrip.trip.segmentCount)}</Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Started</Text>
                              <Text style={styles.metaValue}>
                                {new Date(sharedTrip.trip.startedAt).toLocaleDateString()}
                              </Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Shared</Text>
                              <Text style={styles.metaValue}>
                                {new Date(sharedTrip.sharedAt).toLocaleDateString()}
                              </Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Updated</Text>
                              <Text style={styles.metaValue}>
                                {new Date(sharedTrip.trip.updatedAt).toLocaleDateString()}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </>
        )}
      </View>

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
  screenContent: {
    flex: 1,
    justifyContent: "flex-start",
  },
  tripsRoot: {
    flex: 1,
  },
  subtitle: {
    fontSize: 15,
    color: "#52624f",
    marginBottom: 12,
  },
  modeToggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  modeToggleChip: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "#e8ede2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  modeToggleChipSelected: {
    backgroundColor: "#243224",
  },
  modeToggleChipDisabled: {
    opacity: 0.45,
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  modeToggleTextSelected: {
    color: "#fffdf8",
  },
  filterRow: {
    alignItems: "center",
    gap: 10,
    minHeight: 38,
  },
  filterScroll: {
    flexGrow: 0,
    height: 38,
    marginBottom: 8,
  },
  filterChip: {
    height: 38,
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#e8ede2",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  filterChipSelected: {
    backgroundColor: "#243224",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  filterChipTextSelected: {
    color: "#fffdf8",
  },
  summaryTable: {
    borderRadius: 18,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    marginBottom: 12,
    overflow: "hidden",
  },
  summaryCollapsedHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryCollapsedTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#243224",
  },
  summaryCollapsedValues: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },
  summaryCollapsedValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#243224",
  },
  summaryToggleIcon: {
    width: 30,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: "#ebe1cf",
  },
  summaryHeaderRow: {
    minHeight: 44,
    backgroundColor: "#ece4d4",
    borderTopWidth: 0,
  },
  summaryTotalRow: {
    backgroundColor: "#f0eadb",
  },
  summaryModeCell: {
    flex: 1.15,
  },
  summaryValueCell: {
    flex: 1,
  },
  summaryHeaderCell: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#76856f",
    fontWeight: "700",
  },
  summaryModeText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  summaryValueText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#355035",
  },
  summarySkeletonCell: {
    alignItems: "flex-start",
  },
  summaryValueSkeleton: {
    width: 68,
    height: 14,
    borderRadius: 999,
    backgroundColor: "#ddd4c3",
  },
  empty: {
    fontSize: 15,
    color: "#52624f",
  },
  listScroll: {
    flex: 1,
  },
  listScrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  list: {
    paddingBottom: 0,
  },
  tripCardRow: {
    marginBottom: 14,
  },
  tripCard: {
    borderRadius: 22,
    backgroundColor: "#f6f1e5",
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#ebe1cf",
  },
  sharedTripCard: {
    backgroundColor: "#eef3eb",
    borderColor: "#d9e3d3",
  },
  tripBodyPressable: {
    gap: 14,
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
  tripBadgePressable: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  tripBadgeDisabled: {
    opacity: 0.72,
  },
  tripBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#355035",
  },
  sharedTripBadge: {
    backgroundColor: "#d7e3d2",
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
  metaValueSkeleton: {
    width: 78,
    height: 15,
    borderRadius: 999,
    backgroundColor: "#ddd4c3",
    marginTop: 2,
  },
  sharedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  sharedRefreshButton: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sharedRefreshButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  sharedError: {
    fontSize: 14,
    fontWeight: "600",
    color: "#a03a32",
    marginBottom: 12,
  },
  swipeActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
    justifyContent: "flex-end",
    paddingLeft: 12,
    marginBottom: 14,
  },
  swipeAction: {
    width: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#e6ece1",
    paddingVertical: 18,
  },
  swipeActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  openSwipeAction: {
    backgroundColor: "#e6ece1",
  },
  deleteSwipeAction: {
    backgroundColor: "#f7e0db",
  },
  deleteSwipeActionText: {
    color: "#9f3f31",
  },
  resumeSwipeAction: {
    backgroundColor: "#dfead9",
  },
  resumeSwipeActionText: {
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
});
