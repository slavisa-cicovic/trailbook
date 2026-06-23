import { useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { TripWithMeta } from '@/feature/trips/tripsStore';
import type { SegmentType } from '@/core/domain/model/segment';
import type { AppThemePalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/useAppTheme';

const SEGMENT_LABEL: Record<SegmentType, string> = {
  WALK: 'Walk', BIKE: 'Bike', DRIVE: 'Drive',
  BOAT: 'Boat', PLANE: 'Plane', STATIONARY: 'Stationary', UNKNOWN: '—',
};

const HIDDEN_TYPES: SegmentType[] = ['STATIONARY', 'UNKNOWN'];

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

function modeLabel(segments: TripWithMeta['segments']): string {
  const types = [...new Set(
    segments.map((s) => s.segmentType).filter((t) => !HIDDEN_TYPES.includes(t)),
  )];
  return types.length === 0 ? '—' : types.map((t) => SEGMENT_LABEL[t]).join(' + ');
}

interface Props {
  item: TripWithMeta;
  onPress(): void;
  onDelete(): void;
}

export function TripCard({ item, onPress, onDelete }: Props) {
  const { trip, segments, totalDistanceM, waypointCount, photoCount } = item;
  const swipeRef = useRef<SwipeableMethods>(null);
  const { theme, resolvedMode } = useAppTheme();

  const night = resolvedMode === 'night';
  const swipeOpenBg = night ? '#1a3d32' : '#d4e8e0';
  const swipeOpenColor = night ? '#a8d8c0' : '#1f2a1f';

  const durationMs = trip.endedAt
    ? trip.endedAt.getTime() - trip.startedAt.getTime()
    : 0;

  const syncLabel = trip.syncState === 'SYNCED' ? 'SYNCED'
    : trip.syncState === 'PENDING' ? 'PENDING'
    : 'FAILED';

  const badgeBg = trip.syncState === 'SYNCED'
    ? (night ? '#1a3d18' : '#d4ead0')
    : trip.syncState === 'FAILED'
    ? theme.dangerMuted
    : theme.accentMuted;

  const badgeTextColor = trip.syncState === 'SYNCED'
    ? (night ? '#7dcf78' : '#2e6b2a')
    : trip.syncState === 'FAILED'
    ? theme.danger
    : theme.mutedText;

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        <Pressable
          style={[styles.swipeOpen, { backgroundColor: swipeOpenBg }]}
          onPress={() => { swipeRef.current?.close(); onPress(); }}
        >
          <Text style={[styles.swipeOpenText, { color: swipeOpenColor }]}>Open</Text>
        </Pressable>
        <Pressable style={[styles.swipeDelete, { backgroundColor: theme.dangerMuted }]} onPress={onDelete}>
          <Text style={[styles.swipeDeleteText, { color: theme.danger }]}>Delete</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} friction={2} rightThreshold={40}>
      <Pressable style={[styles.card, { backgroundColor: theme.card }]} onPress={onPress}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.primaryText }]} numberOfLines={1}>
            {trip.title}
          </Text>
          <View style={[styles.badge, { backgroundColor: badgeBg }]}>
            <Text style={[styles.badgeText, { color: badgeTextColor }]}>{syncLabel}</Text>
          </View>
        </View>

        <View style={styles.grid}>
          <StatCell label="MODE" value={modeLabel(segments)} theme={theme} />
          <StatCell label="DISTANCE" value={formatDistance(totalDistanceM)} theme={theme} />
          <StatCell label="WAYPOINTS" value={String(waypointCount)} theme={theme} />
          <StatCell label="PHOTOS" value={String(photoCount)} theme={theme} />
          <StatCell label="SEGMENTS" value={String(segments.length)} theme={theme} />
          <StatCell label="DURATION" value={durationMs > 0 ? formatDuration(durationMs) : '—'} theme={theme} />
          <StatCell label="STARTED" value={formatDate(trip.startedAt)} theme={theme} />
          <StatCell label="ENDED" value={trip.endedAt ? formatDate(trip.endedAt) : '—'} theme={theme} />
        </View>
      </Pressable>
    </Swipeable>
  );
}

function StatCell({ label, value, theme }: { label: string; value: string; theme: AppThemePalette }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statLabel, { color: theme.mutedText }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.primaryText }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 20, marginBottom: 10 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16, gap: 8,
  },
  title: { flex: 1, fontSize: 22, fontWeight: '800' },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  statCell: { width: '50%', paddingVertical: 6 },
  statLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  swipeActions: {
    flexDirection: 'row', marginBottom: 10,
    borderRadius: 20, overflow: 'hidden', marginLeft: 8,
  },
  swipeOpen: { width: 100, alignItems: 'center', justifyContent: 'center' },
  swipeOpenText: { fontSize: 15, fontWeight: '700' },
  swipeDelete: {
    width: 100, alignItems: 'center', justifyContent: 'center',
    borderTopRightRadius: 20, borderBottomRightRadius: 20,
  },
  swipeDeleteText: { fontSize: 15, fontWeight: '700' },
});
