import { MaterialIcons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import type { Trip } from "../../../domain/trips";
import { formatDurationSummary } from "../../../services/trips/trips-management.service";
import { formatDistanceKm } from "../../../services/trip-points/trip-points.service";

interface Props {
  anySyncing: boolean;
  distanceLoading: boolean;
  distanceMeters: number | null;
  isSyncing: boolean;
  isTripSelected: boolean;
  isTripSelectionMode: boolean;
  photoCount: number;
  sessionMode: "demo" | "authenticated";
  trip: Trip;
  tripModeSummary: string;
  tripSegmentsCount: number;
  waypointCount: number;
  onDelete: () => void;
  onLongPress: () => void;
  onOpen: () => void;
  onPress: () => void;
  onResume: () => void;
  onSwipeGesture?: () => void;
  onSync: () => void;
}

export function TripCard({
  anySyncing,
  distanceLoading,
  distanceMeters,
  isSyncing,
  isTripSelected,
  isTripSelectionMode,
  photoCount,
  sessionMode,
  trip,
  tripModeSummary,
  tripSegmentsCount,
  waypointCount,
  onDelete,
  onLongPress,
  onOpen,
  onPress,
  onResume,
  onSwipeGesture,
  onSync,
}: Props) {
  const statusLabel =
    trip.status === "active" ? "Active" : trip.status === "paused" ? "Paused" : trip.syncStatus;
  const showStatusBadge = trip.status !== "ended" || sessionMode === "authenticated";
  const isSyncBadge = trip.status === "ended" && sessionMode === "authenticated";
  const tripDurationMs = Math.max(
    0,
    new Date(trip.endedAt ?? new Date().toISOString()).getTime() -
      new Date(trip.startedAt).getTime(),
  );

  return (
    <Swipeable
      enabled={!isTripSelectionMode}
      friction={2}
      onSwipeableCloseStartDrag={onSwipeGesture}
      onSwipeableOpenStartDrag={onSwipeGesture}
      onSwipeableWillClose={onSwipeGesture}
      onSwipeableWillOpen={onSwipeGesture}
      overshootRight={false}
      renderRightActions={() => (
        <View style={styles.swipeActions}>
          <Pressable onPress={onOpen} style={[styles.swipeAction, styles.openSwipeAction]}>
            <Text style={styles.swipeActionText}>Open</Text>
          </Pressable>
          {trip.status !== "ended" ? (
            <Pressable onPress={onResume} style={[styles.swipeAction, styles.resumeSwipeAction]}>
              <Text style={[styles.swipeActionText, styles.resumeSwipeActionText]}>Resume</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onDelete} style={[styles.swipeAction, styles.deleteSwipeAction]}>
              <Text style={[styles.swipeActionText, styles.deleteSwipeActionText]}>Delete</Text>
            </Pressable>
          )}
        </View>
      )}
    >
      <View style={styles.tripCardRow}>
        <View style={[styles.tripCard, isTripSelected && styles.tripCardSelected]}>
          <Pressable onLongPress={onLongPress} onPress={onPress} style={styles.tripBodyPressable}>
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
                    accessibilityLabel={isSyncing ? "Syncing trip" : "Sync trip"}
                    disabled={isSyncing || anySyncing}
                    onPress={(event) => {
                      event.stopPropagation();
                      onSync();
                    }}
                    style={[
                      styles.tripBadge,
                      styles.tripBadgePressable,
                      isSyncing && styles.tripBadgeDisabled,
                    ]}
                  >
                    {isSyncing ? <ActivityIndicator color="#355035" size="small" /> : null}
                    <Text style={styles.tripBadgeText}>{isSyncing ? "syncing" : statusLabel}</Text>
                  </Pressable>
                ) : (
                  <View style={styles.tripBadge}>
                    <Text style={styles.tripBadgeText}>{statusLabel}</Text>
                  </View>
                )
              ) : null}
              {isTripSelectionMode ? (
                <View
                  style={[
                    styles.selectionCheck,
                    isTripSelected && styles.selectionCheckSelected,
                  ]}
                >
                  {isTripSelected ? (
                    <MaterialIcons color="#fffdf8" name="check" size={16} />
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaCell}>
                <Text style={styles.metaKey}>Mode</Text>
                <Text style={styles.metaValue}>{tripModeSummary}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaKey}>Distance</Text>
                {distanceLoading ? (
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
                <Text style={styles.metaValue}>{String(tripSegmentsCount)}</Text>
              </View>
              <View style={styles.metaCell}>
                <Text style={styles.metaKey}>Duration</Text>
                <Text style={styles.metaValue}>{formatDurationSummary(tripDurationMs)}</Text>
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
}

const styles = StyleSheet.create({
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
  tripCardSelected: {
    borderColor: "#243224",
    backgroundColor: "#eee7d7",
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
  selectionCheck: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#9aa691",
    alignItems: "center",
    justifyContent: "center",
  },
  selectionCheckSelected: {
    borderColor: "#243224",
    backgroundColor: "#243224",
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
});
