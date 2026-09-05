import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { ActiveWaypoint } from '@/feature/recording/recordingStore';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';
import { CATEGORY_ICON } from '@/constants/waypointCategories';
import type { TranslationKey } from '@/i18n/translations';

interface Props {
  waypoint: ActiveWaypoint;
  onAddPhoto: () => void;
  onRemove: () => void;
}

export function WaypointCard({ waypoint, onAddPhoto, onRemove }: Props) {
  const { theme } = useAppTheme();
  const { locale, t } = useI18n();
  const coords = `${waypoint.latitude.toFixed(5)}, ${waypoint.longitude.toFixed(5)}`;
  const time = waypoint.createdAt.toLocaleString(locale);

  return (
    <View style={[styles.card, { backgroundColor: theme.accentMuted }]}>
      {waypoint.firstImageUri && (
        <Image source={{ uri: waypoint.firstImageUri }} style={styles.photo} />
      )}

      <View style={styles.body}>
        <View style={styles.categoryChip}>
          <MaterialIcons name={CATEGORY_ICON[waypoint.category]} size={13} color="#fffdf8" />
          <Text style={styles.categoryLabel}>{t(`category.${waypoint.category.toLowerCase()}` as TranslationKey).toUpperCase()}</Text>
        </View>

        <Text style={[styles.title, { color: theme.primaryText }]}>{waypoint.title}</Text>

        <View style={styles.actions}>
          <Pressable style={[styles.addPhotoBtn, { backgroundColor: theme.border }]} onPress={onAddPhoto}>
            <Text style={[styles.addPhotoText, { color: theme.primaryText }]}>{t('waypoint.addPhoto')}</Text>
          </Pressable>
          <Pressable style={[styles.removeBtn, { backgroundColor: theme.dangerMuted }]} onPress={onRemove}>
            <Text style={[styles.removeText, { color: theme.danger }]}>{t('waypoint.removeWaypoint')}</Text>
          </Pressable>
        </View>

        <Text style={[styles.meta, { color: theme.mutedText }]}>{t('waypoint.location')} {coords}</Text>
        <Text style={[styles.meta, { color: theme.mutedText }]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
  },
  photo: {
    width: '100%',
    height: 160,
    resizeMode: 'cover',
  },
  body: {
    padding: 14,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#c0631a',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  categoryLabel: {
    color: '#fffdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: { fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8 },
  addPhotoBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  addPhotoText: { fontSize: 13, fontWeight: '600' },
  removeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16 },
  removeText: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 12 },
});
