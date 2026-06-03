import { useCallback, useState } from "react";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import { useFeatureFlags } from "../../core/hooks/use-feature-flags";
import type { Trip } from "../../domain/trips";
import {
  applyRawEventReprocessing,
  previewRawEventReprocessing,
  type ReprocessingPreview,
} from "../../services/recording/raw-event-reprocessing.service";
import { formatDistanceKm } from "../../services/trip-points/trip-points.service";
import { formatDurationSummary } from "../../services/trips/trips-management.service";
import { setTripPointsInMemory } from "../../state/trip-points-store";
import { setTripSegments } from "../../state/trip-segments-store";
import { setTrips } from "../../state/trips-store";
import { useSessionStore } from "../../state/session-store";
import { useThemeStore } from "../../state/theme-store";
import { setWaypoints } from "../../state/waypoints-store";
import {
  loadRawLocationEventTripSummaries,
  type RawLocationEventTripSummary,
} from "../../repositories/raw-location-events-repository";
import { loadTripSegments } from "../../repositories/trip-segments-repository";
import { loadTrips } from "../../repositories/trips-repository";
import { loadWaypoints } from "../../repositories/waypoints-repository";

interface CandidateRow {
  summary: RawLocationEventTripSummary;
  trip: Trip;
}

function formatDate(value: string | null) {
  if (!value) {
    return "n/a";
  }

  return new Date(value).toLocaleString();
}

function formatPreview(preview: ReprocessingPreview) {
  const warnings = preview.warnings.length > 0
    ? `\n\nWarnings:\n${preview.warnings.map((warning) => `- ${warning}`).join("\n")}`
    : "";

  return [
    `Raw events: ${preview.rawEventCount}`,
    `Old: ${preview.oldPointCount} points, ${formatDistanceKm(preview.oldDistanceMeters)}, ${preview.oldSegmentCount} segments`,
    `New: ${preview.newPointCount} points, ${formatDistanceKm(preview.newDistanceMeters)}, ${preview.newSegmentCount} segments`,
    `Rejected raw: ${preview.rejectedRawEventCount}`,
    `Duplicate raw: ${preview.duplicateRawEventCount}`,
    `Max raw gap: ${formatDurationSummary(preview.maxRawGapMs)}`,
    `Max accepted gap: ${formatDurationSummary(preview.maxAcceptedGapMs)}`,
    warnings,
  ].join("\n");
}

export default function RawEventReprocessingScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);
  const featureFlags = useFeatureFlags();
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const theme = getAppTheme(resolveAppThemeMode(themeMode, systemColorScheme));
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [trips, summaries] = await Promise.all([
        loadTrips(),
        loadRawLocationEventTripSummaries(),
      ]);
      const tripsByLocalId = new Map(trips.map((trip) => [trip.localId, trip]));
      const nextCandidates = summaries
        .map((summary) => {
          const trip = tripsByLocalId.get(summary.tripLocalId);

          if (!trip || trip.deletedAt !== null || trip.userId !== identitySession?.userId) {
            return null;
          }

          return { summary, trip };
        })
        .filter((candidate): candidate is CandidateRow => candidate !== null);

      setCandidates(nextCandidates);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load raw event trips.");
    } finally {
      setLoading(false);
    }
  }, [identitySession?.userId]);

  useFocusEffect(useCallback(() => {
    void reload();
  }, [reload]));

  async function refreshStoresAfterApply() {
    const [nextTrips, nextTripSegments, nextWaypoints] = await Promise.all([
      loadTrips(),
      loadTripSegments(),
      loadWaypoints(),
    ]);

    await setTrips(nextTrips);
    await setTripSegments(nextTripSegments);
    await setWaypoints(nextWaypoints);
    setTripPointsInMemory([]);
  }

  async function handleApply(trip: Trip) {
    setBusyTripId(trip.localId);
    setMessage(null);

    try {
      const result = await applyRawEventReprocessing(trip.localId);
      await refreshStoresAfterApply();
      await reload();
      setMessage(
        `Applied ${trip.title}: ${result.newPointCount} points, ${formatDistanceKm(result.newDistanceMeters)}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Raw reprocessing failed.");
    } finally {
      setBusyTripId(null);
    }
  }

  async function handlePreview(trip: Trip) {
    setBusyTripId(trip.localId);
    setMessage(null);

    try {
      const preview = await previewRawEventReprocessing(trip.localId);

      Alert.alert(
        `Reprocess ${trip.title}`,
        formatPreview(preview),
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Apply",
            style: "destructive",
            onPress: () => {
              void handleApply(trip);
            },
          },
        ],
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Raw reprocessing preview failed.");
    } finally {
      setBusyTripId(null);
    }
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (!featureFlags.rawEventReprocessingEnabled) {
    return <Redirect href="/settings" />;
  }

  return (
    <ScreenLayout
      contentVariant="plain"
      onBack={() => router.back()}
      showBottomNavigation
      title="Raw reprocessing"
    >
      <View style={styles.root}>
        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.primaryText }]}>Rebuild route from raw GPS callbacks</Text>
          <Text style={[styles.description, { color: theme.mutedText }]}>
            Debug-only tool. Preview compares current route output with replayed raw events restored from the backend. Apply replaces points and segments for the selected ended trip.
          </Text>
        </View>

        {message ? (
          <Text style={[styles.message, { color: theme.mutedText }]}>{message}</Text>
        ) : null}

        {loading ? (
          <Text style={[styles.description, { color: theme.mutedText }]}>Loading raw event trips...</Text>
        ) : null}

        {!loading && candidates.length === 0 ? (
          <Text style={[styles.description, { color: theme.mutedText }]}>No local trips with raw events.</Text>
        ) : null}

        <View style={styles.list}>
          {candidates.map(({ summary, trip }) => {
            const busy = busyTripId === trip.localId;
            const canReprocess = trip.status === "ended" && trip.endedAt !== null;

            return (
              <View
                key={trip.localId}
                style={[
                  styles.row,
                  { backgroundColor: theme.card, borderColor: theme.border },
                  (!canReprocess || busy) && styles.disabled,
                ]}
              >
                <View style={[styles.icon, { backgroundColor: theme.accentMuted }]}>
                  <MaterialIcons color={theme.accent} name="replay" size={20} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: theme.primaryText }]}>{trip.title}</Text>
                  <Text style={[styles.rowDescription, { color: theme.mutedText }]}>
                    {summary.rawEventCount} raw, {summary.acceptedCount} accepted, {summary.rejectedCount} rejected, {summary.duplicateCount} duplicate
                  </Text>
                  <Text style={[styles.rowDescription, { color: theme.mutedText }]}>
                    {formatDate(summary.firstRecordedAt)} → {formatDate(summary.lastRecordedAt)}
                  </Text>
                  <View style={styles.rowActions}>
                    <Pressable
                      disabled={busy || !canReprocess}
                      onPress={() => void handlePreview(trip)}
                      style={({ pressed }) => [
                        styles.secondaryButton,
                        { borderColor: theme.border },
                        pressed && styles.buttonPressed,
                        (busy || !canReprocess) && styles.disabled,
                      ]}
                    >
                      <MaterialIcons color={theme.accent} name="visibility" size={16} />
                      <Text style={[styles.secondaryButtonText, { color: theme.primaryText }]}>
                        {busy ? "Working..." : canReprocess ? "Preview" : "Active"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  infoCard: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    gap: 10,
  },
  row: {
    alignItems: "flex-start",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  disabled: {
    opacity: 0.58,
  },
  icon: {
    alignItems: "center",
    borderRadius: 13,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  rowDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 7,
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 11,
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: "800",
  },
  buttonPressed: {
    opacity: 0.72,
  },
});
