import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TripWithMeta } from '@/feature/trips/tripsStore';
import type { SegmentType } from '@/core/domain/model/segment';
import { useAppTheme } from '@/hooks/useAppTheme';

const SEGMENT_LABEL: Record<SegmentType, string> = {
  WALK: 'Walk', BIKE: 'Bike', DRIVE: 'Drive',
  BOAT: 'Boat', PLANE: 'Plane', STATIONARY: 'Stationary', UNKNOWN: 'Unknown',
};

function formatKm(m: number): string {
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface ModeRow {
  type: SegmentType;
  distanceM: number;
  durationMs: number;
  count: number;
}

interface Props {
  trips: TripWithMeta[];
}

export function TotalCard({ trips }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { theme } = useAppTheme();

  const totalDistanceM = trips.reduce((acc, t) => acc + t.totalDistanceM, 0);
  const totalDurationMs = trips.reduce((acc, t) => {
    if (!t.trip.endedAt) return acc;
    return acc + (t.trip.endedAt.getTime() - t.trip.startedAt.getTime());
  }, 0);

  const modeMap = new Map<SegmentType, ModeRow>();
  for (const t of trips) {
    for (const s of t.segments) {
      if (s.segmentType === 'STATIONARY' || s.segmentType === 'UNKNOWN') continue;
      const existing = modeMap.get(s.segmentType);
      const segMs = s.endedAt.getTime() - s.startedAt.getTime();
      if (existing) {
        existing.distanceM += s.distanceM ?? 0;
        existing.durationMs += segMs;
        existing.count += 1;
      } else {
        modeMap.set(s.segmentType, {
          type: s.segmentType,
          distanceM: s.distanceM ?? 0,
          durationMs: segMs,
          count: 1,
        });
      }
    }
  }
  const modeRows = [...modeMap.values()].sort((a, b) => b.distanceM - a.distanceM);

  return (
    <Pressable style={[styles.card, { backgroundColor: theme.card }]} onPress={() => setExpanded((v) => !v)}>
      <View style={styles.summary}>
        <Text style={[styles.totalLabel, { color: theme.primaryText }]}>Total</Text>
        <View style={styles.summaryRight}>
          <Text style={[styles.totalValue, { color: theme.primaryText }]}>{formatKm(totalDistanceM)}</Text>
          <Text style={[styles.totalValue, { color: theme.primaryText }]}>{formatDuration(totalDurationMs)}</Text>
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={theme.primaryText} />
        </View>
      </View>

      {expanded && modeRows.length > 0 && (
        <View style={styles.breakdown}>
          <View style={[styles.tableHeader, { borderBottomColor: theme.border }]}>
            <Text style={[styles.col1, styles.colLabel, { color: theme.mutedText }]}>MODE</Text>
            <Text style={[styles.col2, styles.colLabel, { color: theme.mutedText }]}>KM</Text>
            <Text style={[styles.col3, styles.colLabel, { color: theme.mutedText }]}>TIME</Text>
            <Text style={[styles.col4, styles.colLabel, { color: theme.mutedText }]}>TRIPS</Text>
          </View>
          {modeRows.map((row) => (
            <View key={row.type} style={[styles.tableRow, { borderBottomColor: theme.border }]}>
              <Text style={[styles.col1, styles.rowValue, { color: theme.primaryText }]}>{SEGMENT_LABEL[row.type]}</Text>
              <Text style={[styles.col2, styles.rowValue, { color: theme.primaryText }]}>{formatKm(row.distanceM)}</Text>
              <Text style={[styles.col3, styles.rowValue, { color: theme.primaryText }]}>{formatDuration(row.durationMs)}</Text>
              <Text style={[styles.col4, styles.rowValue, { color: theme.primaryText }]}>{row.count}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, marginBottom: 10 },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontSize: 17, fontWeight: '700' },
  summaryRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  totalValue: { fontSize: 17, fontWeight: '700' },
  breakdown: { marginTop: 16 },
  tableHeader: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1 },
  tableRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  rowValue: { fontSize: 15, fontWeight: '600' },
  col1: { flex: 2 },
  col2: { flex: 2 },
  col3: { flex: 2 },
  col4: { flex: 1 },
});
