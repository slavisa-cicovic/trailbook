import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/i18nStore';

export const WAYPOINT_PREVIEW_WIDTH = 148;
export const WAYPOINT_PREVIEW_HEIGHT = 108;
export const WAYPOINT_PREVIEW_STEM_SIZE = 14;

export interface WaypointPhotoPreviewPlacement {
  card: {
    left: number;
    top: number;
  };
  stem: {
    left: number;
  };
  stemPosition: 'top' | 'bottom';
}

interface WaypointPhotoPreviewProps {
  imageUri: string;
  onClose: () => void;
  onOpen: () => void;
  placement: WaypointPhotoPreviewPlacement;
  title: string;
}

export function WaypointPhotoPreview({
  imageUri,
  onClose,
  onOpen,
  placement,
  title,
}: WaypointPhotoPreviewProps) {
  const { t } = useI18n();
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoadState('loading');
    setRetryKey(0);
  }, [imageUri]);

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <Pressable
        accessibilityLabel={t('tripDetails.closeWaypointPreview')}
        onPress={onClose}
        style={styles.backdrop}
      />
      <View style={[styles.cardWrap, placement.card]}>
        {placement.stemPosition === 'top' && (
          <View style={[styles.stem, styles.stemTop, placement.stem]} />
        )}
        <Pressable
          accessibilityLabel={`${t('tripDetails.openWaypoint')} ${title}`}
          onPress={onOpen}
          style={styles.card}
        >
          <Image
            key={retryKey}
            onError={() => setLoadState('failed')}
            onLoad={() => setLoadState('loaded')}
            onLoadStart={() => setLoadState('loading')}
            resizeMethod="resize"
            resizeMode="cover"
            source={{ uri: imageUri }}
            style={styles.image}
          />
          {loadState !== 'loaded' ? (
            <View style={styles.imageStatus}>
              {loadState === 'loading' ? (
                <ActivityIndicator color="#52624f" />
              ) : (
                <Pressable
                  accessibilityLabel={t('tripDetails.retryWaypointPhoto')}
                  onPress={(event) => {
                    event.stopPropagation();
                    setLoadState('loading');
                    setRetryKey((current) => current + 1);
                  }}
                  style={styles.retry}
                >
                  <MaterialIcons color="#52624f" name="refresh" size={22} />
                  <Text style={styles.retryText}>{t('tripDetails.retryPhoto')}</Text>
                </Pressable>
              )}
            </View>
          ) : null}
          <View style={styles.titleOverlay}>
            <Text numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          </View>
        </Pressable>
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
    width: WAYPOINT_PREVIEW_WIDTH,
  },
  card: {
    width: WAYPOINT_PREVIEW_WIDTH,
    height: WAYPOINT_PREVIEW_HEIGHT,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: '#ebe1cf',
    shadowColor: '#142014',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 7,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#d7ddcf',
  },
  imageStatus: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d7ddcf',
  },
  retry: { alignItems: 'center', gap: 4, padding: 12 },
  retryText: { color: '#52624f', fontSize: 11, fontWeight: '700' },
  titleOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 9,
    paddingTop: 18,
    paddingBottom: 7,
    backgroundColor: 'rgba(20, 28, 20, 0.56)',
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fffdf8',
  },
  stem: {
    position: 'absolute',
    width: WAYPOINT_PREVIEW_STEM_SIZE,
    height: WAYPOINT_PREVIEW_STEM_SIZE,
    backgroundColor: '#fffdf8',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ebe1cf',
  },
  stemTop: {
    top: -WAYPOINT_PREVIEW_STEM_SIZE / 2,
    transform: [{ rotate: '225deg' }],
  },
  stemBottom: {
    bottom: -WAYPOINT_PREVIEW_STEM_SIZE / 2,
    transform: [{ rotate: '45deg' }],
  },
});
