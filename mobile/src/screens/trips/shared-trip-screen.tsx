import { useEffect, useMemo, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getRecordingProfileColor, getRecordingProfileLabel } from "../../constants/recording-profiles";
import type { SharedTripDetail } from "../../domain/shared-trips";
import type { Waypoint } from "../../domain/trips";
import { getSharedTrip } from "../../services/trips/server-trip-sharing.service";
import { formatDistanceKm } from "../../services/trip-points/trip-points.service";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
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

function calculateDistanceMeters(coordinates: Array<{ latitude: number; longitude: number }>) {
  if (coordinates.length < 2) {
    return 0;
  }

  const earthRadius = 6371000;
  let total = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const left = coordinates[index - 1];
    const right = coordinates[index];
    const lat1 = (left.latitude * Math.PI) / 180;
    const lat2 = (right.latitude * Math.PI) / 180;
    const deltaLat = ((right.latitude - left.latitude) * Math.PI) / 180;
    const deltaLon = ((right.longitude - left.longitude) * Math.PI) / 180;
    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    total += earthRadius * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  return total;
}

export default function SharedTripScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);
  const { shareId } = useLocalSearchParams<{ shareId?: string | string[] }>();
  const resolvedShareId = Array.isArray(shareId) ? shareId[0] : shareId;
  const [sharedTrip, setSharedTrip] = useState<SharedTripDetail | null>(null);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [mapType, setMapType] = useState<TrailbookMapType>("standard");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshSharedTrip() {
    if (!identitySession?.sessionToken || !resolvedShareId) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const nextSharedTrip = await getSharedTrip(identitySession.sessionToken, resolvedShareId);
      setSharedTrip(nextSharedTrip);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load shared trip.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSharedTrip();
  }, [identitySession?.sessionToken, resolvedShareId]);

  async function handleLogout() {
    await setActiveIdentitySession(null);
  }

  function handleSelectWaypoint(waypoint: Waypoint) {
    if (!resolvedShareId) {
      return;
    }

    router.push(`/trips/shared/${resolvedShareId}/waypoints/${waypoint.localId}`);
  }

  const routeCoordinates = useMemo(
    () =>
      sharedTrip?.trip.points.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
      })) ?? [],
    [sharedTrip],
  );

  const waypointMarkers = useMemo(
    () =>
      (sharedTrip?.trip.waypoints ?? []).map((waypoint) => ({
        hasPhotos: (sharedTrip?.trip.attachments ?? []).some((attachment) => attachment.waypointId === waypoint.id),
        waypoint: {
          localId: waypoint.id,
          serverId: waypoint.id,
          tripLocalId: sharedTrip?.trip.id ?? "",
          segmentLocalId: waypoint.segmentId,
          deviceId: "shared-trip",
          userId: sharedTrip?.owner.id ?? "",
          latitude: waypoint.latitude,
          longitude: waypoint.longitude,
          category: waypoint.category,
          title: waypoint.title,
          note: waypoint.note,
          createdAt: waypoint.createdAt,
          updatedAt: waypoint.updatedAt,
          deletedAt: null,
          syncStatus: "synced",
        } satisfies Waypoint,
      })),
    [sharedTrip],
  );

  const segmentPolylines = useMemo(
    () =>
      (sharedTrip?.trip.segments ?? []).map((segment) => ({
        color: getRecordingProfileColor(segment.recordingProfile),
        coordinates: sharedTrip!.trip.points
          .filter((point) => point.segmentId === segment.id)
          .map((point) => ({
            latitude: point.latitude,
            longitude: point.longitude,
          })),
        segmentLocalId: segment.id,
      })),
    [sharedTrip],
  );

  const mapRegion = buildTripMapRegion(
    routeCoordinates.length > 0
      ? routeCoordinates
      : waypointMarkers.map(({ waypoint }) => ({
          latitude: waypoint.latitude,
          longitude: waypoint.longitude,
        })),
  );

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (identitySession.mode === "demo") {
    return <Redirect href="/trips" />;
  }

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
      title="Shared trip"
    >
      {loading ? <Text style={styles.helperText}>Loading shared trip...</Text> : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {sharedTrip ? (
        <>
          <View style={styles.detailsAccordionCard}>
            <Pressable
              onPress={() => setDetailsExpanded((current) => !current)}
              style={styles.detailsAccordionTrigger}
            >
              <Text numberOfLines={1} style={styles.tripTitle}>
                {sharedTrip.trip.title}
              </Text>
              <View style={styles.detailsAccordionActions}>
                <Pressable onPress={() => void refreshSharedTrip()} style={styles.refreshButton}>
                  <Text style={styles.refreshButtonText}>{loading ? "Refreshing..." : "Refresh"}</Text>
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
                <Text style={styles.ownerText}>
                  Shared by {sharedTrip.owner.displayName} ({sharedTrip.owner.email})
                </Text>
                {sharedTrip.trip.description ? (
                  <Text style={styles.tripDescription}>{sharedTrip.trip.description}</Text>
                ) : null}
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryKey}>Mode</Text>
                    <Text style={styles.summaryValue}>
                      {sharedTrip.trip.segments.length > 1 ? "Mixed" : getRecordingProfileLabel(sharedTrip.trip.recordingProfile)}
                    </Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryKey}>Distance</Text>
                    <Text style={styles.summaryValue}>{formatDistanceKm(calculateDistanceMeters(routeCoordinates))}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryKey}>Waypoints</Text>
                    <Text style={styles.summaryValue}>{String(sharedTrip.trip.waypoints.length)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryKey}>Segments</Text>
                    <Text style={styles.summaryValue}>{String(sharedTrip.trip.segments.length)}</Text>
                  </View>
                  <View style={styles.summaryItem}>
                    <Text style={styles.summaryKey}>Updated</Text>
                    <Text style={styles.summaryValue}>{new Date(sharedTrip.trip.updatedAt).toLocaleString()}</Text>
                  </View>
                </View>
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
            region={mapRegion}
            segmentPolylines={segmentPolylines}
            waypointMarkers={waypointMarkers}
          />
        </>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    gap: 12,
    paddingBottom: 12,
  },
  detailsAccordionCard: {
    borderRadius: 20,
    backgroundColor: "#eef3eb",
    borderWidth: 1,
    borderColor: "#d9e3d3",
    overflow: "hidden",
  },
  detailsAccordionTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  detailsAccordionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  refreshButton: {
    borderRadius: 14,
    backgroundColor: "#dfe8d9",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  tripTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    color: "#243224",
  },
  detailsAccordionBody: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 16,
  },
  ownerText: {
    fontSize: 13,
    color: "#546652",
  },
  tripDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: "#4f5f4f",
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
  helperText: {
    fontSize: 15,
    color: "#52624f",
  },
  errorText: {
    fontSize: 15,
    color: "#a03a32",
    fontWeight: "600",
  },
  mapTypeRow: {
    flexDirection: "row",
    gap: 8,
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
});
