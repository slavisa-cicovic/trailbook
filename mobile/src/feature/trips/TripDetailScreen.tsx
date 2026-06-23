import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { format } from 'date-fns';
import { useTripDetailStore } from '@/feature/trips/tripDetailStore';
import { SEGMENT_COLOR, SEGMENT_LABEL } from '@/constants/segmentColors';
import { reprocessTrip } from '@/core/domain/usecase/ReprocessTripUseCase';
import type { Segment } from '@/core/domain/model/segment';
import type { RawLocationSample } from '@/core/domain/model/rawSamples';
import ScreenLayout from '@/components/layout/screen-layout';
import { useAppTheme } from '@/hooks/useAppTheme';

function pointsForSegment(locations: RawLocationSample[], seg: Segment) {
  return locations
    .filter((l) => l.timestamp >= seg.startedAt && l.timestamp <= seg.endedAt)
    .map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
}

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDistance(m: number | null) {
  if (!m) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export default function TripDetailScreen() {
  const { clientTripId } = useLocalSearchParams<{ clientTripId: string }>();
  const router = useRouter();
  const { theme, resolvedMode } = useAppTheme();

  const load = useTripDetailStore((s) => s.load);
  const reset = useTripDetailStore((s) => s.reset);
  const trip = useTripDetailStore((s) => s.trip);
  const segments = useTripDetailStore((s) => s.segments);
  const waypoints = useTripDetailStore((s) => s.waypoints);
  const imagesByWaypoint = useTripDetailStore((s) => s.imagesByWaypoint);
  const locationSamples = useTripDetailStore((s) => s.locationSamples);
  const loading = useTripDetailStore((s) => s.loading);
  const [reprocessing, setReprocessing] = useState(false);

  useEffect(() => {
    if (clientTripId) load(clientTripId);
    return () => reset();
  }, [clientTripId]);

  async function onReprocess() {
    if (!clientTripId) return;
    setReprocessing(true);
    const result = await reprocessTrip(clientTripId);
    setReprocessing(false);
    if (!result.ok) Alert.alert('Reprocess failed', result.error);
    else load(clientTripId);
  }

  if (loading || !trip) {
    return (
      <ScreenLayout onBack={() => router.back()}>
        <ActivityIndicator color={theme.accent} />
      </ScreenLayout>
    );
  }

  const allCoords = locationSamples.map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
  const durationMs = trip.endedAt ? trip.endedAt.getTime() - trip.startedAt.getTime() : 0;
  const totalDistanceM = segments.reduce((a, s) => a + (s.distanceM ?? 0), 0);

  return (
    <ScreenLayout
      title={trip.title}
      onBack={() => router.back()}
      contentVariant="plain"
      scrollEnabled
    >
      {allCoords.length > 0 && (
        <View style={[styles.mapCard, { backgroundColor: theme.accentMuted }]}>
          <MapView
            style={styles.map}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            userInterfaceStyle={resolvedMode === 'night' ? 'dark' : 'light'}
            initialRegion={{
              latitude: allCoords[0]!.latitude,
              longitude: allCoords[0]!.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            scrollEnabled
            zoomEnabled
          >
            {segments.map((seg, i) => {
              const pts = pointsForSegment(locationSamples, seg);
              return pts.length > 1 ? (
                <Polyline key={i} coordinates={pts} strokeColor={SEGMENT_COLOR[seg.segmentType]} strokeWidth={4} />
              ) : null;
            })}
            {waypoints.map((w) => (
              <Marker key={w.id} coordinate={{ latitude: w.latitude, longitude: w.longitude }} title={w.title} pinColor={theme.accent} />
            ))}
          </MapView>
        </View>
      )}

      <View style={[styles.statsCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.date, { color: theme.mutedText }]}>{format(trip.startedAt, 'dd MMM yyyy · HH:mm')}</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.primaryText }]}>{formatDuration(durationMs)}</Text>
            <Text style={[styles.statLabel, { color: theme.mutedText }]}>Duration</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.primaryText }]}>{formatDistance(totalDistanceM)}</Text>
            <Text style={[styles.statLabel, { color: theme.mutedText }]}>Distance</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: theme.primaryText }]}>{waypoints.length}</Text>
            <Text style={[styles.statLabel, { color: theme.mutedText }]}>Waypoints</Text>
          </View>
        </View>
      </View>

      {segments.length > 0 && (
        <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.mutedText }]}>Segments</Text>
          {segments.map((seg, i) => (
            <View key={i} style={styles.segRow}>
              <View style={[styles.segDot, { backgroundColor: SEGMENT_COLOR[seg.segmentType] }]} />
              <View style={styles.segInfo}>
                <Text style={[styles.segType, { color: theme.primaryText }]}>{SEGMENT_LABEL[seg.segmentType]}</Text>
                <Text style={[styles.segMeta, { color: theme.mutedText }]}>
                  {formatDuration(seg.endedAt.getTime() - seg.startedAt.getTime())}
                  {seg.distanceM ? ` · ${formatDistance(seg.distanceM)}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {waypoints.length > 0 && (
        <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.mutedText }]}>Waypoints</Text>
          {waypoints.map((w, i) => (
            <Pressable
              key={w.id}
              style={[
                styles.waypointRow,
                i < waypoints.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
              ]}
              onPress={() => router.push(`/waypoint/${w.id}`)}
            >
              <View style={styles.waypointInfo}>
                <Text style={[styles.waypointTitle, { color: theme.primaryText }]}>{w.title}</Text>
                <Text style={[styles.waypointMeta, { color: theme.mutedText }]}>
                  {w.category} · {imagesByWaypoint[w.id]?.length ?? 0} photos
                </Text>
              </View>
              <Text style={[styles.chevron, { color: theme.mutedText }]}>›</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.sectionCard, { backgroundColor: theme.card }]}>
        <Pressable
          style={[styles.reprocessBtn, { borderColor: theme.border }, reprocessing && { opacity: 0.6 }]}
          onPress={() => void onReprocess()}
          disabled={reprocessing}
        >
          {reprocessing ? (
            <ActivityIndicator color={theme.accent} />
          ) : (
            <Text style={[styles.reprocessText, { color: theme.mutedText }]}>Reprocess trip (v{trip.processingVersion})</Text>
          )}
        </Pressable>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 12,
    height: 240,
  },
  map: { flex: 1 },
  statsCard: {
    borderRadius: 24,
    padding: 20,
    gap: 14,
    marginBottom: 12,
  },
  date: { fontSize: 13 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: 32 },
  sectionCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  segRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segDot: { width: 12, height: 12, borderRadius: 6 },
  segInfo: { flex: 1 },
  segType: { fontSize: 15, fontWeight: '500' },
  segMeta: { fontSize: 12, marginTop: 1 },
  waypointRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  waypointInfo: { flex: 1 },
  waypointTitle: { fontSize: 15, fontWeight: '500' },
  waypointMeta: { fontSize: 12, marginTop: 1 },
  chevron: { fontSize: 20 },
  reprocessBtn: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  reprocessText: { fontSize: 14 },
});
