import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import type { TripGroupWithMembers } from '@/core/domain/model/tripGroup';
import type { TripWithMeta } from '@/feature/trips/tripsStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

interface Props {
  item: TripGroupWithMembers;
  tripsById: Map<string, TripWithMeta>;
  syncing?: boolean;
  onDelete(): void;
  onOpen(): void;
  onSync(): void;
}

export function GroupCard({ item, tripsById, syncing = false, onDelete, onOpen, onSync }: Props) {
  const { theme } = useAppTheme();
  const { t } = useI18n();
  const swipeRef = useRef<Swipeable>(null);
  const trips = item.members
    .map((member) => tripsById.get(member.tripClientId))
    .filter((trip): trip is TripWithMeta => Boolean(trip));
  const totalDistanceM = trips.reduce((acc, trip) => acc + trip.totalDistanceM, 0);
  const pending = item.group.syncState !== 'SYNCED' || item.members.some((member) => member.syncState !== 'SYNCED');
  const badgeLabel = t(syncing ? 'trips.sync.syncing' : pending ? 'trips.sync.pending' : 'trips.sync.synced').toUpperCase();

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        <Pressable
          style={[styles.swipeOpen, { backgroundColor: theme.accentMuted }]}
          onPress={() => {
            swipeRef.current?.close();
            onOpen();
          }}
        >
          <Text style={[styles.swipeOpenText, { color: theme.mutedText }]}>{t('common.open')}</Text>
        </Pressable>
        <Pressable
          style={[styles.swipeDelete, { backgroundColor: theme.dangerMuted }]}
          onPress={() => {
            swipeRef.current?.close();
            onDelete();
          }}
        >
          <Text style={[styles.swipeDeleteText, { color: theme.danger }]}>{t('common.delete')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} friction={2} rightThreshold={40}>
      <Pressable style={[styles.card, { backgroundColor: theme.card }]} onPress={onOpen}>
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={[styles.title, { color: theme.primaryText }]} numberOfLines={1}>
              {item.group.title}
            </Text>
            {item.group.description && (
              <Text style={[styles.description, { color: theme.mutedText }]} numberOfLines={2}>
                {item.group.description}
              </Text>
            )}
          </View>
          <Pressable
            disabled={!pending || syncing}
            hitSlop={8}
            style={[styles.badge, { backgroundColor: pending ? theme.accentMuted : '#d4ead0' }]}
            onPress={onSync}
          >
            <Text style={[styles.badgeText, { color: pending ? theme.mutedText : '#2e6b2a' }]}>
              {badgeLabel}
            </Text>
          </Pressable>
        </View>
        <View style={styles.metaRow}>
          <Meta label={t('trips.title')} value={String(item.members.length)} color={theme.mutedText} textColor={theme.primaryText} />
          <Meta label={t('trips.distance')} value={formatDistance(totalDistanceM)} color={theme.mutedText} textColor={theme.primaryText} />
        </View>
      </Pressable>
    </Swipeable>
  );
}

function Meta({
  label,
  value,
  color,
  textColor,
}: {
  label: string;
  value: string;
  color: string;
  textColor: string;
}) {
  return (
    <View style={styles.meta}>
      <Text style={[styles.metaLabel, { color }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 20, marginBottom: 10 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  titleWrap: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  description: { fontSize: 14, lineHeight: 19, marginTop: 4 },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', marginTop: 18 },
  meta: { flex: 1 },
  metaLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  metaValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },
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
