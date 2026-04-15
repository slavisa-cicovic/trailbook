import { useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getRecordingProfileLabel } from "../../constants/recording-profiles";
import type { Trip, Waypoint } from "../../domain/trips";
import type { TripTimelineEntry } from "../../services/trip-pauses/trip-pauses.service";
import {
  buildSegmentPolylines,
  buildTripSegmentsSummary,
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
  calculateTripDistanceMeters,
  formatDistanceKm,
  getVisibleTripPointsForTrip,
} from "../../services/trip-points/trip-points.service";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { useTripPausesStore } from "../../state/trip-pauses-store";
import { setTripSegments, useTripSegmentsStore } from "../../state/trip-segments-store";
import { setTripPoints, useTripPointsStore } from "../../state/trip-points-store";
import { setWaypointAttachments, useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import {
  listShareRecipients,
  listTripShares,
  shareTripWithRecipient,
  syncTripToServer,
  uploadTripAttachmentToServer,
} from "../../services/trips/server-trip-sharing.service";
import TripEditModal from "./components/trip-edit-modal";
import TripShareModal from "./components/trip-share-modal";
import TripRouteMap, { type TrailbookMapType } from "./components/trip-route-map";

const mapTypeOptions: Array<{ label: string; value: TrailbookMapType }> = [
  { label: "Map", value: "standard" },
  { label: "Satellite", value: "satellite" },
  { label: "Hybrid", value: "hybrid" },
];

const editableModeOptions = ["walk", "bike", "drive", "boat", "plane"] as const;

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
  const tripPauses = useTripPausesStore((state) => state.tripPauses);
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
  const [shareList, setShareList] = useState<
    Array<{
      createdAt: string;
      id: string;
      recipient: { displayName: string; email: string; id: string };
      revokedAt: string | null;
      status: "active" | "revoked";
    }>
  >([]);
  const [shareRecipientSuggestions, setShareRecipientSuggestions] = useState<
    Array<{ displayName: string; email: string; id: string }>
  >([]);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [segmentEditSegmentId, setSegmentEditSegmentId] = useState<string | null>(null);
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
  const currentUserTripPauses = identitySession
    ? tripPauses.filter((tripPause) => tripPause.userId === identitySession.userId)
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
  const selectedTripPauses = selectedTrip
    ? currentUserTripPauses.filter((tripPause) => tripPause.tripLocalId === selectedTrip.localId)
    : [];
  const selectedTripTimeline: TripTimelineEntry[] = selectedTrip
    ? buildTripTimelineEntries(selectedTripSegments, selectedTripPauses, new Date().toISOString())
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
        attachments: selectedTripAttachments,
        trip: selectedTrip,
        tripSegments: currentUserTripSegments.filter((segment) => segment.tripLocalId === selectedTrip.localId),
        tripPoints: currentUserTripPoints.filter((point) => point.tripLocalId === selectedTrip.localId),
        waypoints: currentUserWaypoints.filter((waypoint) => waypoint.tripLocalId === selectedTrip.localId),
      });

      const syncedAt = response.syncedAt;
      const uploadedAttachments = [];
      const attachmentsToUpload = selectedTripAttachments.filter(
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
                  updatedAt: syncedAt,
                }
              : attachment,
          ),
        );
      }

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
      const nextShares = await listTripShares(identitySession.sessionToken, tripId);
      setShareList(nextShares.shares);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Unable to share this trip.");
    } finally {
      setShareBusy(false);
    }
  }

  async function openTripShare() {
    if (!selectedTrip || !identitySession?.sessionToken) {
      return;
    }

    setShareBusy(true);
    setShareError(null);
    setShareSuccess(null);

    try {
      const tripId = selectedTrip.serverId ?? (await syncSelectedTripIfNeeded());
      const [sharesResponse, recipientsResponse] = await Promise.all([
        listTripShares(identitySession.sessionToken, tripId),
        listShareRecipients(identitySession.sessionToken),
      ]);
      setShareList(sharesResponse.shares);
      setShareRecipientSuggestions(recipientsResponse.recipients);
      setTripShareVisible(true);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Unable to load trip shares.");
      setTripShareVisible(true);
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

  async function handleUpdateSegmentMode(nextMode: (typeof editableModeOptions)[number]) {
    if (!selectedTrip || !segmentEditSegmentId) {
      return;
    }

    if (selectedTrip.status !== "ended") {
      Alert.alert("Open trip", "Stop the route before editing segment modes.");
      return;
    }

    const updatedAt = new Date().toISOString();

    try {
      const nextState = updateTripSegmentMode(
        currentUserTripSegments,
        currentUserTripPoints,
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
      const nextTripPoints = tripPoints.map(
        (tripPoint) => nextState.tripPoints.find((candidate) => candidate.localId === tripPoint.localId) ?? tripPoint,
      );
      const nextWaypoints = waypoints.map(
        (waypoint) => nextState.waypoints.find((candidate) => candidate.localId === waypoint.localId) ?? waypoint,
      );

      await setTripSegments(nextTripSegments);
      await setTripPoints(nextTripPoints);
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
      onLogout={() => void handleLogout()}
      scrollEnabled={false}
      showBottomNavigation
      title="Route"
    >
      <Modal
        animationType="fade"
        onRequestClose={() => setSegmentEditSegmentId(null)}
        transparent
        visible={segmentEditTarget !== null}
      >
        <View style={styles.segmentEditOverlay}>
          <View style={styles.segmentEditCard}>
            <Text style={styles.segmentEditTitle}>Change segment mode</Text>
            {segmentEditTarget ? (
              <Text style={styles.segmentEditSubtitle}>
                Current: {getRecordingProfileLabel(segmentEditTarget.recordingProfile)}
              </Text>
            ) : null}
            <View style={styles.segmentEditOptions}>
              {editableModeOptions.map((option) => {
                const selected = segmentEditTarget?.recordingProfile === option;

                return (
                  <Pressable
                    key={option}
                    onPress={() => void handleUpdateSegmentMode(option)}
                    style={[styles.segmentEditOption, selected && styles.segmentEditOptionSelected]}
                  >
                    <Text
                      style={[styles.segmentEditOptionText, selected && styles.segmentEditOptionTextSelected]}
                    >
                      {getRecordingProfileLabel(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => setSegmentEditSegmentId(null)} style={styles.segmentEditCancelButton}>
              <Text style={styles.segmentEditCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
        existingShares={shareList}
        onChangeRecipientEmail={setShareRecipientEmail}
        onClose={() => {
          setTripShareVisible(false);
          setShareError(null);
          setShareSuccess(null);
          setShareRecipientEmail("");
        }}
        onShare={() => void handleShareTrip()}
        recipientEmail={shareRecipientEmail}
        recipientSuggestions={shareRecipientSuggestions}
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
              <Pressable
                accessibilityLabel="Edit trip"
                onPress={() => openTripEdit(selectedTrip)}
                style={styles.headerIconButton}
              >
                <MaterialIcons color="#243224" name="edit" size={18} />
              </Pressable>
              {identitySession.mode === "authenticated" ? (
                <>
                  <Pressable
                    accessibilityLabel={syncBusy ? "Syncing trip" : "Sync trip"}
                    onPress={() => void syncSelectedTripIfNeeded()}
                    style={[styles.headerIconButton, styles.syncButton]}
                  >
                    <MaterialIcons color={syncIconColor} name="sync" size={18} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Share trip"
                    onPress={() => {
                      void openTripShare();
                    }}
                    style={[styles.headerIconButton, styles.shareButton]}
                  >
                    <MaterialIcons color="#243224" name="share" size={18} />
                  </Pressable>
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
            {selectedTripTimeline.length > 0 ? (
              <View style={styles.segmentsList}>
                <Text style={styles.segmentsTitle}>Timeline</Text>
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
  headerIconButton: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    padding: 10,
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
    alignItems: "flex-start",
    gap: 10,
  },
  summaryItem: {
    flex: 1,
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
