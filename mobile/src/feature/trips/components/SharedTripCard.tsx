import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SharedTripListItemDto } from '@/core/data/remote/FetchRemoteTripDataSource';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { AppThemePalette } from '@/constants/app-theme';

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
}

interface Props {
  item: SharedTripListItemDto;
  onPress(): void;
}

export function SharedTripCard({ item, onPress }: Props) {
  const { theme } = useAppTheme();

  return (
    <Pressable style={[styles.card, { backgroundColor: theme.card }]} onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.primaryText }]}>
            {item.title}
          </Text>
          <Text numberOfLines={1} style={[styles.owner, { color: theme.mutedText }]}>
            Shared by {item.owner.displayName || item.owner.email}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.accentMuted }]}>
          <Text style={[styles.badgeText, { color: theme.accent }]}>READ ONLY</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <StatCell label="DISTANCE" value={formatDistance(item.distanceM)} theme={theme} />
        <StatCell label="WAYPOINTS" value={String(item.waypointCount)} theme={theme} />
        <StatCell label="PHOTOS" value={String(item.photoCount)} theme={theme} />
        <StatCell label="STARTED" value={formatDate(item.startedAt)} theme={theme} />
      </View>
    </Pressable>
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
  badge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  card: { borderRadius: 20, marginBottom: 10, padding: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  owner: { fontSize: 13, fontWeight: '700', marginTop: 3 },
  statCell: { paddingVertical: 6, width: '50%' },
  statLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  title: { fontSize: 22, fontWeight: '800' },
  titleWrap: { flex: 1 },
});
