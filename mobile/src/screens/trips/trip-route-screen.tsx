import { useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getRecordingProfileLabel } from "../../constants/recording-profiles";
import type { Trip, Waypoint } from "../../domain/trips";
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
import { useTripPointsStore } from "../../state/trip-points-store";
import { useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { useWaypointsStore } from "../../state/waypoints-store";
import TripEditModal from "./components/trip-edit-modal";
import TripRouteMap from "./components/trip-route-map";

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
  const tripPoints = useTripPointsStore((state) => state.tripPoints);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [tripEditVisible, setTripEditVisible] = useState(false);
  const [tripDraft, setTripDraft] = useState<TripUpdateInput>({
    title: "",
    description: "",
  });

  const resolvedTripId = Array.isArray(tripId) ? tripId[0] : tripId;
  const visibleTrips = getVisibleTrips(trips);
  const selectedTrip = visibleTrips.find((trip) => trip.localId === resolvedTripId) ?? null;
  const selectedTripPoints = selectedTrip
    ? getVisibleTripPointsForTrip(tripPoints, selectedTrip.localId)
    : [];
  const selectedTripWaypoints = selectedTrip
    ? getVisibleWaypointsForTrip(waypoints, selectedTrip.localId)
    : [];
  const selectedTripAttachments = selectedTrip
    ? getVisibleAttachmentsForWaypoints(
        waypointAttachments,
        selectedTripWaypoints.map((waypoint) => waypoint.localId),
      )
    : [];
  const routeCoordinates = selectedTripPoints.map((tripPoint) => ({
    latitude: tripPoint.latitude,
    longitude: tripPoint.longitude,
  }));
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

  return (
    <ScreenLayout
      accountEmail={identitySession.userEmail}
      contentStyle={styles.screenContent}
      contentVariant="plain"
      onBack={() => router.replace("/trips")}
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

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryText}>
            <Text numberOfLines={1} style={styles.tripTitle}>
              {selectedTrip.title}
            </Text>
            {selectedTrip.description ? (
              <Text numberOfLines={2} style={styles.tripDescription}>
                {selectedTrip.description}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={() => openTripEdit(selectedTrip)} style={styles.headerEditButton}>
            <Text style={styles.headerEditButtonText}>Edit</Text>
          </Pressable>
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryKey}>Mode</Text>
            <Text style={styles.summaryValue}>{getRecordingProfileLabel(selectedTrip.recordingProfile)}</Text>
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
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.noteOnlyDot]} />
            <Text style={styles.legendText}>Note only</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, styles.noteWithPhotosDot]} />
            <Text style={styles.legendText}>Note + photos</Text>
          </View>
        </View>
      </View>

      <TripRouteMap
        coordinates={routeCoordinates}
        onSelectWaypoint={handleSelectWaypoint}
        region={selectedTripMapRegion}
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
  summaryCard: {
    borderRadius: 20,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    padding: 16,
    gap: 14,
  },
  summaryText: {
    flex: 1,
    gap: 4,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  tripTitle: {
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
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  noteOnlyDot: {
    backgroundColor: "#355035",
  },
  noteWithPhotosDot: {
    backgroundColor: "#9f5f0f",
  },
  legendText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#52624f",
  },
});
