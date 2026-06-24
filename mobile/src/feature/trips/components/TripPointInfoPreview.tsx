import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SEGMENT_COLOR, SEGMENT_LABEL } from '@/constants/segmentColors';
import type { SegmentType } from '@/core/domain/model/segment';

export const TRIP_POINT_PREVIEW_WIDTH = 158;
export const TRIP_POINT_PREVIEW_HEIGHT = 86;
export const TRIP_POINT_PREVIEW_STEM_SIZE = 12;

export interface TripPointInfo {
  accuracyM: number | null;
  id: string;
  latitude: number;
  longitude: number;
  recordedAt: Date;
  segmentType: SegmentType;
  speedMps: number | null;
}

export interface TripPointInfoPreviewPlacement {
  card: {
    left: number;
    top: number;
  };
  stem: {
    left: number;
  };
  stemPosition: 'top' | 'bottom';
}

interface TripPointInfoPreviewProps {
  onClose: () => void;
  placement: TripPointInfoPreviewPlacement;
  point: TripPointInfo;
}

function formatRecordedAt(recordedAt: Date) {
  return recordedAt.toLocaleString([], {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  });
}

function formatSpeed(speedMps: number | null) {
  return speedMps === null || speedMps < 0 ? null : `${Math.round(speedMps * 3.6)} km/h`;
}

function formatAccuracy(accuracyM: number | null) {
  return accuracyM === null ? null : `±${Math.round(accuracyM)} m`;
}

export function TripPointInfoPreview({
  onClose,
  placement,
  point,
}: TripPointInfoPreviewProps) {
  const speed = formatSpeed(point.speedMps);
  const accuracy = formatAccuracy(point.accuracyM);

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Pressable
        accessibilityLabel="Close trip point information"
        onPress={onClose}
        style={styles.backdrop}
      />
      <View style={[styles.cardWrap, placement.card]}>
        {placement.stemPosition === 'top' && (
          <View style={[styles.stem, styles.stemTop, placement.stem]} />
        )}
        <View style={styles.card}>
          <View style={styles.header}>
            <View
              style={[
                styles.modeDot,
                { backgroundColor: SEGMENT_COLOR[point.segmentType] },
              ]}
            />
            <Text style={styles.mode}>{SEGMENT_LABEL[point.segmentType]}</Text>
          </View>
          <Text style={styles.recordedAt}>{formatRecordedAt(point.recordedAt)}</Text>
          <View style={styles.metaRow}>
            {speed && <Text style={styles.metaPill}>{speed}</Text>}
            {accuracy && <Text style={styles.metaPill}>{accuracy}</Text>}
          </View>
        </View>
        {placement.stemPosition === 'bottom' && (
          <View style={[styles.stem, styles.stemBottom, placement.stem]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  cardWrap: {
    position: 'absolute',
    width: TRIP_POINT_PREVIEW_WIDTH,
  },
  card: {
    minHeight: TRIP_POINT_PREVIEW_HEIGHT,
    borderRadius: 14,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#ebe1cf',
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 4,
    shadowColor: '#142014',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  modeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  mode: {
    fontSize: 12,
    fontWeight: '800',
    color: '#243224',
  },
  recordedAt: {
    fontSize: 10,
    fontWeight: '600',
    color: '#52624f',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    borderRadius: 999,
    backgroundColor: '#e6ece1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: '700',
    color: '#243224',
  },
  stem: {
    position: 'absolute',
    width: TRIP_POINT_PREVIEW_STEM_SIZE,
    height: TRIP_POINT_PREVIEW_STEM_SIZE,
    backgroundColor: '#fffdf8',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ebe1cf',
  },
  stemTop: {
    top: -TRIP_POINT_PREVIEW_STEM_SIZE / 2,
    transform: [{ rotate: '225deg' }],
  },
  stemBottom: {
    bottom: -TRIP_POINT_PREVIEW_STEM_SIZE / 2,
    transform: [{ rotate: '45deg' }],
  },
});
