import { useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import type { TripWithMeta } from '@/feature/trips/tripsStore';
import type { SegmentType } from '@/core/domain/model/segment';
import type { AppThemePalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';
import type { TranslationKey } from '@/i18n/translations';

const SEGMENT_LABEL: Record<SegmentType, TranslationKey | null> = {
  WALK: 'activity.walk', BIKE: 'activity.bike', DRIVE: 'activity.drive',
  BOAT: 'activity.boat', PLANE: 'activity.plane', STATIONARY: 'activity.stationary', UNKNOWN: null,
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

function modeLabel(segments: TripWithMeta['segments'], t: (key: TranslationKey) => string): string {
  const types = [...new Set(
    segments.map((s) => s.segmentType).filter((t) => !HIDDEN_TYPES.includes(t)),
  )];
  return types.length === 0 ? '—' : types.map((type) => SEGMENT_LABEL[type] ? t(SEGMENT_LABEL[type]!) : '—').join(' + ');
}

interface Props {
  item: TripWithMeta;
  onPress(): void;
  onLongPress?(): void;
  onDelete(): void;
  onSync(): void;
  syncing?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
}

export function TripCard({
  item,
  onPress,
  onLongPress,
  onDelete,
  onSync,
  syncing = false,
  selected = false,
  selectionMode = false,
}: Props) {
  const { trip, segments, totalDistanceM, waypointCount, photoCount } = item;
  const swipeRef = useRef<Swipeable>(null);
  const { theme, resolvedMode } = useAppTheme();
  const { locale, t } = useI18n();

  const night = resolvedMode === 'night';
  const swipeOpenBg = night ? '#1a3d32' : '#d4e8e0';
  const swipeOpenColor = night ? '#a8d8c0' : '#1f2a1f';

  const durationMs = trip.endedAt
    ? trip.endedAt.getTime() - trip.startedAt.getTime()
    : 0;

  const syncLabel = t(syncing ? 'trips.sync.syncing'
    : trip.syncState === 'SYNCED' ? 'trips.sync.synced'
    : trip.syncState === 'PENDING' ? 'trips.sync.pending'
    : 'trips.sync.failed').toUpperCase();

  const badgeBg = syncing
    ? theme.accentMuted
    : trip.syncState === 'SYNCED'
    ? (night ? '#1a3d18' : '#d4ead0')
    : trip.syncState === 'FAILED'
    ? theme.dangerMuted
    : theme.accentMuted;

  const badgeTextColor = syncing
    ? theme.mutedText
    : trip.syncState === 'SYNCED'
    ? (night ? '#7dcf78' : '#2e6b2a')
    : trip.syncState === 'FAILED'
    ? theme.danger
    : theme.mutedText;

  function handleSyncPress() {
    if (!syncing) onSync();
  }

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        <Pressable
          style={[styles.swipeOpen, { backgroundColor: swipeOpenBg }]}
          onPress={() => { swipeRef.current?.close(); onPress(); }}
        >
          <Text style={[styles.swipeOpenText, { color: swipeOpenColor }]}>{t('common.open')}</Text>
        </Pressable>
        <Pressable style={[styles.swipeDelete, { backgroundColor: theme.dangerMuted }]} onPress={onDelete}>
          <Text style={[styles.swipeDeleteText, { color: theme.danger }]}>{t('common.delete')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      enabled={!selectionMode}
      renderRightActions={renderRightActions}
      friction={2}
      rightThreshold={40}
    >
      <View
        accessibilityLabel={`Open trip ${trip.title}`}
        style={[
          styles.card,
          {
            backgroundColor: selected ? theme.accentMuted : theme.card,
            borderColor: selected ? theme.accent : 'transparent',
          },
        ]}
        testID={`trip-card-${trip.clientTripId}`}
      >
        <View style={styles.header}>
          <Pressable style={styles.titlePressable} onPress={onPress} onLongPress={onLongPress}>
            <Text style={[styles.title, { color: theme.primaryText }]} numberOfLines={1}>
              {trip.title}
            </Text>
          </Pressable>
          <Pressable
            disabled={syncing}
            hitSlop={8}
            style={[styles.badge, { backgroundColor: badgeBg }]}
            onPress={handleSyncPress}
          >
            <Text style={[styles.badgeText, { color: badgeTextColor }]}>{syncLabel}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.grid} onPress={onPress} onLongPress={onLongPress}>
          <StatCell label={t('trips.mode')} value={modeLabel(segments, t)} theme={theme} />
          <StatCell label={t('trips.distance')} value={formatDistance(totalDistanceM)} theme={theme} />
          <StatCell label={t('trips.waypoints')} value={String(waypointCount)} theme={theme} />
          <StatCell label={t('trips.photos')} value={String(photoCount)} theme={theme} />
          <StatCell label={t('trips.segments')} value={String(segments.length)} theme={theme} />
          <StatCell label={t('trips.duration')} value={durationMs > 0 ? formatDuration(durationMs) : '—'} theme={theme} />
          <StatCell label={t('trips.started')} value={trip.startedAt.toLocaleDateString(locale)} theme={theme} />
          <StatCell label={t('trips.ended')} value={trip.endedAt ? trip.endedAt.toLocaleDateString(locale) : '—'} theme={theme} />
        </Pressable>
      </View>
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
  card: { borderRadius: 20, padding: 20, marginBottom: 10, borderWidth: 2 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16, gap: 8,
  },
  titlePressable: { flex: 1 },
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
