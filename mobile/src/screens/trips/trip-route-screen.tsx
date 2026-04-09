import { useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getRecordingProfileLabel } from "../../constants/recording-profiles";
import type { Trip, Waypoint } from "../../domain/trips";
import {
  buildSegmentPolylines,
  buildTripModeSummary,
  buildTripSegmentsSummary,
} from "../../services/trip-segments/trip-segments.service";
import {
  getVisibleAttachmentsForWaypoints,
  getVisibleTrips,
  getVisibleWaypointsForTrip,
  type TripUpdateInput,
  updateTripMetadata,
} from "../../services/trips/trips-management.service";
import {
  calculateTripDistanceMeters,
  formatDistanceKm,
  getVisibleTripPointsForTrip,
} from "../../services/trip-points/trip-points.service";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { useTripSegmentsStore } from "../../state/trip-segments-store";
import { useTripPointsStore } from "../../state/trip-points-store";
import { useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { useWaypointsStore } from "../../state/waypoints-store";
import { shareTripWithRecipient, syncTripToServer } from "../../services/trips/server-trip-sharing.service";
import TripEditModal from "./components/trip-edit-modal";
import TripShareModal from "./components/trip-share-modal";
import TripRouteMap, { type TrailbookMapType } from "./components/trip-route-map";

const mapTypeOptions: Array<{ label: string; value: TrailbookMapType }> = [
  { label: "Map", value: "standard" },
  { label: "Satellite", value: "satellite" },
  { label: "Hybrid", value: "hybrid" },
];

function buildTripMapRegion(
  coordinates: Array<{ latitude: number; longitude: number }>,
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

  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.4, 0.01),
  };
}

export default function TripRouteScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string | string[] }>();
  const identitySession = useSessionStore((state) => state.identitySession);
  const trips = useTripsStore((state) => state.trips);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const tripPoints = useTripPointsStore((state) => state.tripPoints);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [tripEditVisible, setTripEditVisible] = useState(false);
  const [tripShareVisible, setTripShareVisible] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [mapType, setMapType] = useState<TrailbookMapType>("standard");
  const [shareRecipientEmail, setShareRecipientEmail] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [tripDraft, setTripDraft] = useState<TripUpdateInput>({
    title: "",
    description: "",
  });

  const resolvedTripId = Array.isArray(tripId) ? tripId[0] : tripId;
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
  const selectedTrip = visibleTrips.find((trip) => trip.localId === resolvedTripId) ?? null;
  const selectedTripPoints = selectedTrip
    ? getVisibleTripPointsForTrip(currentUserTripPoints, selectedTrip.localId)
    : [];
  const selectedTripSegments = selectedTrip
    ? buildTripSegmentsSummary(currentUserTripSegments, currentUserTripPoints, selectedTrip.localId)
    : [];
  const selectedTripWaypoints = selectedTrip
    ? getVisibleWaypointsForTrip(currentUserWaypoints, selectedTrip.localId)
    : [];
  const selectedTripAttachments = selectedTrip
    ? getVisibleAttachmentsForWaypoints(
        currentUserWaypointAttachments,
        selectedTripWaypoints.map((waypoint) => waypoint.localId),
      )
    : [];
  const routeCoordinates = selectedTripPoints.map((tripPoint) => ({
    latitude: tripPoint.latitude,
    longitude: tripPoint.longitude,
  }));
  const segmentPolylines = selectedTrip
    ? buildSegmentPolylines(currentUserTripSegments, currentUserTripPoints, selectedTrip.localId)
    : [];
  const fallbackCoordinates = selectedTripWaypoints.map((waypoint) => ({
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
  }));
  const selectedTripMapRegion = buildTripMapRegion(
    routeCoordinates.length > 0 ? routeCoordinates : fallbackCoordinates,
  );

  const waypointMarkers = useMemo(
    () =>
      selectedTripWaypoints.map((waypoint) => ({
        waypoint,
        hasPhotos: selectedTripAttachments.some((attachment) => attachment.waypointLocalId === waypoint.localId),
      })),
    [selectedTripAttachments, selectedTripWaypoints],
  );

  async function handleLogout() {
    await setActiveIdentitySession(null);
  }

  async function syncSelectedTripIfNeeded() {
    if (!identitySession?.sessionToken || !selectedTrip) {
      throw new Error("You must be signed in to sync this trip.");
    }

    setSyncBusy(true);

    try {
      const response = await syncTripToServer(identitySession.sessionToken, {
        trip: selectedTrip,
        tripSegments: currentUserTripSegments.filter((segment) => segment.tripLocalId === selectedTrip.localId),
        tripPoints: currentUserTripPoints.filter((point) => point.tripLocalId === selectedTrip.localId),
        waypoints: currentUserWaypoints.filter((waypoint) => waypoint.tripLocalId === selectedTrip.localId),
      });

      const syncedAt = response.syncedAt;

      await setTrips(
        trips.map((trip) =>
          trip.localId === selectedTrip.localId
            ? {
                ...trip,
                serverId: response.tripId,
                syncStatus: "synced",
                updatedAt: syncedAt,
              }
            : trip,
        ),
      );

      return response.tripId;
    } finally {
      setSyncBusy(false);
    }
  }

  async function handleShareTrip() {
    if (!selectedTrip || !identitySession?.sessionToken) {
      return;
    }

    setShareBusy(true);
    setShareError(null);
    setShareSuccess(null);

    try {
      const tripId = selectedTrip.serverId ?? (await syncSelectedTripIfNeeded());
      const response = await shareTripWithRecipient(
        identitySession.sessionToken,
        tripId,
        shareRecipientEmail.trim(),
      );

      setShareSuccess(`Shared with ${response.recipient.email}`);
      setShareRecipientEmail("");
      setTripShareVisible(false);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Unable to share this trip.");
    } finally {
      setShareBusy(false);
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
        onLogout={() => void handleLogout()}
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

  const distanceText = formatDistanceKm(calculateTripDistanceMeters(selectedTripPoints));
  const modeSummary = buildTripModeSummary(tripSegments, selectedTrip.localId);

  return (
    <ScreenLayout
      accountEmail={identitySession.userEmail}
      accountMode={identitySession.mode}
      contentStyle={styles.screenContent}
      contentVariant="plain"
      onBack={() => router.back()}
      onLogout={() => void handleLogout()}
      scrollEnabled={false}
      showBottomNavigation
      title="Route"
    >
      <TripEditModal
        draft={tripDraft}
        onChangeDescription={(description) => setTripDraft((current) => ({ ...current, description }))}
        onChangeTitle={(title) => setTripDraft((current) => ({ ...current, title }))}
        onClose={() => setTripEditVisible(false)}
        onSave={() => void handleSaveTripEdit()}
        visible={tripEditVisible}
      />
      <TripShareModal
        busy={shareBusy}
        errorMessage={shareError}
        onChangeRecipientEmail={setShareRecipientEmail}
        onClose={() => {
          setTripShareVisible(false);
          setShareError(null);
        }}
        onShare={() => void handleShareTrip()}
        recipientEmail={shareRecipientEmail}
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
            <Pressable onPress={() => openTripEdit(selectedTrip)} style={styles.headerEditButton}>
              <Text style={styles.headerEditButtonText}>Edit</Text>
            </Pressable>
            <MaterialIcons
              color="#243224"
              name={detailsExpanded ? "expand-less" : "expand-more"}
              size={22}
            />
          </View>
        </Pressable>

        {detailsExpanded ? (
          <View style={styles.detailsAccordionBody}>
            {selectedTrip.description ? (
              <Text style={styles.tripDescription}>{selectedTrip.description}</Text>
            ) : null}
            {identitySession.mode === "authenticated" ? (
              <View style={styles.ownerActionsRow}>
                <Pressable
                  onPress={() => void syncSelectedTripIfNeeded()}
                  style={[styles.ownerActionButton, styles.syncButton]}
                >
                  <Text style={styles.ownerActionText}>{syncBusy ? "Syncing..." : "Sync"}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShareError(null);
                    setTripShareVisible(true);
                  }}
                  style={[styles.ownerActionButton, styles.shareButton]}
                >
                  <Text style={styles.ownerActionText}>Share</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.demoHint}>Demo trips stay local-only and cannot be shared.</Text>
            )}
            {shareSuccess ? <Text style={styles.shareSuccessText}>{shareSuccess}</Text> : null}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryKey}>Mode</Text>
                <Text style={styles.summaryValue}>{modeSummary}</Text>
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
                <Text style={styles.summaryKey}>Distance</Text>
                <Text style={styles.summaryValue}>{distanceText}</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryKey}>Segments</Text>
                <Text style={styles.summaryValue}>{String(selectedTripSegments.length)}</Text>
              </View>
            </View>
            {selectedTripSegments.length > 0 ? (
              <View style={styles.segmentsList}>
                <Text style={styles.segmentsTitle}>Segments</Text>
                {selectedTripSegments.map(({ segment, distanceMeters, durationLabel }) => (
                  <View key={segment.localId} style={styles.segmentRow}>
                    <View style={styles.segmentHeader}>
                      <Text style={styles.segmentMode}>{getRecordingProfileLabel(segment.recordingProfile)}</Text>
                      <Text style={styles.segmentDistance}>{formatDistanceKm(distanceMeters)}</Text>
                    </View>
                    <Text style={styles.segmentMeta}>
                      {new Date(segment.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" - "}
                      {segment.endedAt
                        ? new Date(segment.endedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Active"}
                      {" • "}
                      {durationLabel}
                    </Text>
                  </View>
                ))}
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

      <TripRouteMap
        coordinates={routeCoordinates}
        mapType={mapType}
        onSelectWaypoint={handleSelectWaypoint}
        region={selectedTripMapRegion}
        segmentPolylines={segmentPolylines}
        waypointMarkers={waypointMarkers}
      />
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
  mapTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  ownerActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  ownerActionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 12,
  },
  syncButton: {
    backgroundColor: "#e6ece1",
  },
  shareButton: {
    backgroundColor: "#dfead9",
  },
  ownerActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
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
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 10,
    marginHorizontal: -4,
  },
  summaryItem: {
    width: "50%",
    paddingHorizontal: 4,
    gap: 2,
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
  segmentMode: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  segmentDistance: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  segmentMeta: {
    fontSize: 13,
    color: "#52624f",
  },
});
