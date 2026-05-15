import { MaterialIcons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getWaypointCategoryOption } from "../../constants/waypoint-categories";
import type { WaypointAttachment } from "../../domain/trips";
import type { SharedTripDetail } from "../../domain/shared-trips";
import {
  buildTripAttachmentContentUrl,
  getSharedTrip,
} from "../../services/trips/server-trip-sharing.service";
import { useSessionStore } from "../../state/session-store";

export default function SharedTripWaypointScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const identitySession = useSessionStore((state) => state.identitySession);
  const { shareId, waypointId } = useLocalSearchParams<{ shareId?: string | string[]; waypointId?: string | string[] }>();
  const resolvedShareId = Array.isArray(shareId) ? shareId[0] : shareId;
  const resolvedWaypointId = Array.isArray(waypointId) ? waypointId[0] : waypointId;
  const [sharedTrip, setSharedTrip] = useState<SharedTripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSharedTrip() {
      if (!identitySession?.sessionToken || !resolvedShareId) {
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      try {
        const nextSharedTrip = await getSharedTrip(identitySession.sessionToken, resolvedShareId);

        if (active) {
          setSharedTrip(nextSharedTrip);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load shared waypoint.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadSharedTrip();

    return () => {
      active = false;
    };
  }, [identitySession?.sessionToken, resolvedShareId]);

  const selectedWaypoint = useMemo(
    () => sharedTrip?.trip.waypoints.find((waypoint) => waypoint.id === resolvedWaypointId) ?? null,
    [resolvedWaypointId, sharedTrip],
  );

  const selectedWaypointCategory = selectedWaypoint
    ? getWaypointCategoryOption(selectedWaypoint.category)
    : null;
  const attachments = useMemo(() => {
    const sessionToken = identitySession?.sessionToken;

    if (!sharedTrip || !selectedWaypoint || !sessionToken) {
      return [];
    }

    return sharedTrip.trip.attachments
      .filter((attachment) => attachment.waypointId === selectedWaypoint.id)
      .map(
        (attachment) =>
          ({
            localId: attachment.id,
            serverId: attachment.id,
            waypointLocalId: selectedWaypoint.id,
            deviceId: "shared-trip",
            userId: sharedTrip.owner.id,
            type: "photo",
            localUri: buildTripAttachmentContentUrl(sessionToken, attachment.id),
            mimeType: attachment.mimeType,
            fileSize: attachment.fileSizeBytes,
            createdAt: attachment.createdAt,
            updatedAt: attachment.updatedAt,
            deletedAt: null,
            syncStatus: "synced",
          }) satisfies WaypointAttachment,
      );
  }, [identitySession?.sessionToken, selectedWaypoint, sharedTrip]);
  const photoCarouselCardWidth = Math.min(Math.max(screenWidth * 0.74, 240), 340);

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (identitySession.mode === "demo") {
    return <Redirect href="/trips" />;
  }

  if (!resolvedShareId) {
    return <Redirect href="/trips" />;
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
      {loading ? <Text style={styles.helperText}>Loading shared waypoint...</Text> : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      {!loading && !errorMessage && !sharedTrip ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Shared trip not found</Text>
          <Text style={styles.emptyText}>The selected shared trip is no longer available.</Text>
        </View>
      ) : null}

      {!loading && !errorMessage && sharedTrip && !selectedWaypoint ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Waypoint not found</Text>
          <Text style={styles.emptyText}>The selected shared waypoint is no longer available.</Text>
        </View>
      ) : null}

      {sharedTrip && selectedWaypoint ? (
        <>
          {selectedWaypointCategory ? (
            <View style={styles.categoryRow}>
              <View style={[styles.categoryBadge, { backgroundColor: selectedWaypointCategory.color }]}>
                <MaterialIcons color="#fffdf8" name={selectedWaypointCategory.iconName} size={16} />
                <Text style={styles.categoryBadgeText}>{selectedWaypointCategory.label}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.headerCard}>
            <Text style={styles.sharedByText}>Shared by {sharedTrip.owner.displayName}</Text>
            <Text style={styles.title}>{selectedWaypoint.title}</Text>
            {selectedWaypoint.note ? <Text style={styles.note}>{selectedWaypoint.note}</Text> : null}
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Trip</Text>
              <Text style={styles.infoValue}>{sharedTrip.trip.title}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Coordinates</Text>
              <Text style={styles.infoValue}>
                {selectedWaypoint.latitude.toFixed(5)}, {selectedWaypoint.longitude.toFixed(5)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Created</Text>
              <Text style={styles.infoValue}>{new Date(selectedWaypoint.createdAt).toLocaleString()}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Photos</Text>
              <Text style={styles.infoValue}>{attachments.length === 0 ? "No shared photos" : `${attachments.length} photo(s)`}</Text>
            </View>
          </View>

          <View style={styles.photoHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
          </View>

          {attachments.length === 0 ? (
            <View style={styles.emptyPhotos}>
              <Text style={styles.emptyText}>No photos were shared for this waypoint.</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.photoCarouselContent}
              decelerationRate="fast"
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={photoCarouselCardWidth + 12}
            >
              {attachments.map((attachment) => (
                <Pressable
                  key={attachment.localId}
                  onPress={() =>
                    router.push(
                      `/trips/shared/${resolvedShareId}/waypoints/${resolvedWaypointId}/photos/${attachment.localId}`,
                    )
                  }
                  style={[styles.photoCarouselCard, { width: photoCarouselCardWidth }]}
                >
                  <Image source={{ uri: attachment.localUri }} style={styles.photoCarouselImage} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    gap: 16,
    paddingBottom: 28,
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
  headerCard: {
    borderRadius: 20,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    padding: 18,
    gap: 8,
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  sharedByText: {
    fontSize: 13,
    color: "#546652",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#243224",
  },
  note: {
    fontSize: 15,
    lineHeight: 21,
    color: "#4f5f4f",
  },
  infoCard: {
    borderRadius: 20,
    backgroundColor: "#eef3eb",
    borderWidth: 1,
    borderColor: "#d9e3d3",
    padding: 18,
    gap: 12,
  },
  infoRow: {
    gap: 4,
  },
  infoLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#76856f",
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#243224",
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
  photoCarouselImage: {
    width: "100%",
    aspectRatio: 1.08,
    backgroundColor: "#d9e3d3",
  },
});
