import { useEffect, useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import ScreenLayout from "../../components/layout/screen-layout";
import type { Trip } from "../../domain/trips";
import {
  buildTripModeSummary,
  getOpenTripSegmentForTrip,
  getVisibleTripSegmentsForTrip,
} from "../../services/trip-segments/trip-segments.service";
import {
  buildTripsAggregateSummary,
  buildTripSummary,
  filterTripsByDate,
  formatDurationSummary,
  getVisibleTrips,
  markTripDeleted,
  restoreTripDeletedState,
  type TripDateFilter,
  updateTripMetadata,
  type TripUpdateInput,
} from "../../services/trips/trips-management.service";
import { setRecordingSession } from "../../state/recording-store";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { useTripSegmentsStore } from "../../state/trip-segments-store";
import { useTripPointsStore } from "../../state/trip-points-store";
import { setWaypointAttachments, useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import { formatDistanceKm } from "../../services/trip-points/trip-points.service";
import TripEditModal from "./components/trip-edit-modal";

interface PendingUndoState {
  tripLocalId: string;
  tripTitle: string;
}

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
  const trips = useTripsStore((state) => state.trips);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const tripPoints = useTripPointsStore((state) => state.tripPoints);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [pendingUndo, setPendingUndo] = useState<PendingUndoState | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripEditVisible, setTripEditVisible] = useState(false);
  const [dateFilter, setDateFilter] = useState<TripDateFilter>("all");
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
  const currentUserTripPoints = identitySession
    ? tripPoints.filter((tripPoint) => tripPoint.userId === identitySession.userId)
    : [];
  const currentUserWaypoints = identitySession
    ? waypoints.filter((waypoint) => waypoint.userId === identitySession.userId)
    : [];
  const currentUserWaypointAttachments = identitySession
    ? waypointAttachments.filter((attachment) => attachment.userId === identitySession.userId)
    : [];

  const visibleTrips = getVisibleTrips(currentUserTrips);
  const filteredTrips = filterTripsByDate(visibleTrips, dateFilter);
  const tripSummaries = filteredTrips.map((trip) =>
    buildTripSummary(trip, currentUserTripPoints, currentUserWaypoints, currentUserWaypointAttachments),
  );
  const tripsAggregateSummary = buildTripsAggregateSummary(filteredTrips, currentUserTripPoints);
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
      recordingProfile: activeSegment?.recordingProfile ?? trip.recordingProfile,
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
      onLogout={() => void handleLogout()}
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

      <Text style={styles.subtitle}>Your local recorded routes and saved trip content.</Text>

      <ScrollView
        contentContainerStyle={styles.filterRow}
        horizontal
        showsHorizontalScrollIndicator={false}
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
        <View style={[styles.summaryRow, styles.summaryHeaderRow]}>
          <Text style={[styles.summaryHeaderCell, styles.summaryModeCell]}>Mode</Text>
          <Text style={[styles.summaryHeaderCell, styles.summaryValueCell]}>km</Text>
          <Text style={[styles.summaryHeaderCell, styles.summaryValueCell]}>time</Text>
          <Text style={[styles.summaryHeaderCell, styles.summaryValueCell]}>Trips</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryModeText, styles.summaryModeCell]}>Walk</Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDistanceKm(tripsAggregateSummary.walkDistanceMeters)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDurationSummary(tripsAggregateSummary.walkDurationMs)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {String(tripsAggregateSummary.walkTripCount)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryModeText, styles.summaryModeCell]}>Bike</Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDistanceKm(tripsAggregateSummary.bikeDistanceMeters)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDurationSummary(tripsAggregateSummary.bikeDurationMs)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {String(tripsAggregateSummary.bikeTripCount)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryModeText, styles.summaryModeCell]}>Drive</Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDistanceKm(tripsAggregateSummary.driveDistanceMeters)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDurationSummary(tripsAggregateSummary.driveDurationMs)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {String(tripsAggregateSummary.driveTripCount)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryModeText, styles.summaryModeCell]}>Boat</Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDistanceKm(tripsAggregateSummary.boatDistanceMeters)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDurationSummary(tripsAggregateSummary.boatDurationMs)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {String(tripsAggregateSummary.boatTripCount)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryModeText, styles.summaryModeCell]}>Plane</Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDistanceKm(tripsAggregateSummary.planeDistanceMeters)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDurationSummary(tripsAggregateSummary.planeDurationMs)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {String(tripsAggregateSummary.planeTripCount)}
          </Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryTotalRow]}>
          <Text style={[styles.summaryModeText, styles.summaryModeCell]}>Total</Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDistanceKm(tripsAggregateSummary.totalDistanceMeters)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {formatDurationSummary(tripsAggregateSummary.totalDurationMs)}
          </Text>
          <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
            {String(tripsAggregateSummary.totalTripCount)}
          </Text>
        </View>
      </View>

      {tripSummaries.length === 0 ? (
        <Text style={styles.empty}>No trips match the selected date filter.</Text>
      ) : (
        <View style={styles.list}>
          {tripSummaries.map(({ trip, waypointCount, photoCount, distanceMeters }) => {
            const statusLabel = trip.endedAt === null ? "Active" : trip.syncStatus;
            const tripModeSummary = buildTripModeSummary(tripSegments, trip.localId);
            const tripSegmentsForCard = getVisibleTripSegmentsForTrip(tripSegments, trip.localId);
            const tripDurationMs = Math.max(
              0,
              new Date(trip.endedAt ?? new Date().toISOString()).getTime() -
                new Date(trip.startedAt).getTime(),
            );

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
                    {trip.endedAt === null ? (
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
                        <View style={styles.tripBadge}>
                          <Text style={styles.tripBadgeText}>{statusLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.metaGrid}>
                        <View style={styles.metaCell}>
                          <Text style={styles.metaKey}>Mode</Text>
                          <Text style={styles.metaValue}>{tripModeSummary}</Text>
                        </View>
                        <View style={styles.metaCell}>
                          <Text style={styles.metaKey}>Distance</Text>
                          <Text style={styles.metaValue}>{formatDistanceKm(distanceMeters)}</Text>
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
                            {trip.endedAt ? new Date(trip.endedAt).toLocaleDateString() : "Active"}
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
    justifyContent: "flex-start",
  },
  subtitle: {
    fontSize: 15,
    color: "#52624f",
    marginBottom: 16,
  },
  filterRow: {
    gap: 10,
    paddingBottom: 14,
  },
  filterChip: {
    borderRadius: 999,
    backgroundColor: "#e8ede2",
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    marginBottom: 18,
    overflow: "hidden",
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
  empty: {
    fontSize: 15,
    color: "#52624f",
  },
  list: {
    paddingBottom: 20,
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
