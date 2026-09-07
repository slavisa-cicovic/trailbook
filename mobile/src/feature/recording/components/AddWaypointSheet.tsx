import { useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, StyleSheet,
  ScrollView, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { WaypointCategory, ImageSource } from '@/core/domain/model/waypoint';
import { addWaypoint } from '@/core/domain/usecase/AddWaypointUseCase';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import {
  accessErrorMessage,
  isPremiumAccessError,
} from '@/core/domain/access/mobileAccessPolicy';
import {
  CATEGORY_ICON,
  CATEGORY_ORDER,
} from '@/constants/waypointCategories';
import { useI18n } from '@/i18n/i18nStore';
import type { TranslationKey } from '@/i18n/translations';
import {
  coordinatesFromImageAsset,
  capturedAtFromImageAsset,
  currentPhotoCoordinates,
  photoLocationMatchesWaypoint,
  type PhotoCoordinates,
} from '@/core/domain/photo/photoLocation';
import { PhotoVerificationIndicator } from '@/feature/waypoint/components/PhotoVerificationIndicator';

const CATEGORY_KEY: Record<WaypointCategory, TranslationKey> = {
  GENERIC:'category.generic', DEPARTURE:'category.departure', FUEL:'category.fuel', BORDER:'category.border', PORT:'category.port', FERRY:'category.ferry', RESTAURANT:'category.restaurant', CAFE:'category.cafe', VIEWPOINT:'category.viewpoint', MONUMENT:'category.monument', BEACH:'category.beach',
};

interface PhotoItem {
  uri: string;
  source: ImageSource;
  capturedAt: Date | null;
  coordinates: PhotoCoordinates | null;
  locationMatchesWaypoint: boolean;
  waypointCoordinates: PhotoCoordinates | null;
  waypointCreatedAt: Date;
}

interface Props {
  tripId: string;
  visible: boolean;
  onDismiss(): void;
}

export function AddWaypointSheet({ tripId, visible, onDismiss }: Props) {
  const [category, setCategory] = useState<WaypointCategory>('GENERIC');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [premiumError, setPremiumError] = useState(false);
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const router = useRouter();
  const titleInputRef = useRef<TextInput>(null);
  const { localizeError, t } = useI18n();

  async function onCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: t('waypoint.cameraPermission') });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false, exif: true });
    if (!result.canceled && result.assets[0]) {
      const waypointCreatedAt = new Date();
      const waypointCoordinates = await currentPhotoCoordinates();
      const photoCoordinates = coordinatesFromImageAsset(result.assets[0]) ?? waypointCoordinates;
      setPhotos((p) => [...p, {
        uri: result.assets[0]!.uri,
        source: 'CAMERA',
        capturedAt: capturedAtFromImageAsset(result.assets[0]) ?? new Date(),
        coordinates: photoCoordinates,
        locationMatchesWaypoint: waypointCoordinates !== null
          && photoLocationMatchesWaypoint(photoCoordinates, waypointCoordinates),
        waypointCoordinates,
        waypointCreatedAt,
      }]);
    }
  }

  async function onGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: t('waypoint.libraryPermission') });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: true });
    if (!result.canceled && result.assets[0]) {
      const waypointCreatedAt = new Date();
      const waypointCoordinates = await currentPhotoCoordinates();
      const photoCoordinates = coordinatesFromImageAsset(result.assets[0]!);
      setPhotos((p) => [...p, {
        uri: result.assets[0]!.uri,
        source: 'GALLERY',
        capturedAt: capturedAtFromImageAsset(result.assets[0]!),
        coordinates: photoCoordinates,
        locationMatchesWaypoint: waypointCoordinates !== null
          && photoLocationMatchesWaypoint(photoCoordinates, waypointCoordinates),
        waypointCoordinates,
        waypointCreatedAt,
      }]);
    }
  }

  function removePhoto(index: number) {
    setPhotos((p) => p.filter((_, i) => i !== index));
  }

  async function onSave() {
    if (!title.trim()) { setPremiumError(false); setError(t('error.titleRequired')); return; }
    setLoading(true);
    setError(null);
    const result = await addWaypoint({ tripId, title: title.trim(), description: description.trim() || null, category, photos });
    setLoading(false);
    if (!result.ok) {
      setPremiumError(isPremiumAccessError(result.error));
      setError(localizeError(accessErrorMessage(result.error)));
    } else {
      reset();
      onDismiss();
    }
  }

  function reset() {
    setCategory('GENERIC');
    setTitle('');
    setDescription('');
    setPhotos([]);
    setError(null);
    setPremiumError(false);
  }

  function onCancel() { reset(); onDismiss(); }

  function onViewPremium() {
    onCancel();
    setTimeout(() => router.push('/premium'), 250);
  }

  const canSave = title.trim().length > 0 && !loading;
  const suggestedTitle = category === 'GENERIC'
    ? t('waypoint.defaultTitle')
    : t(CATEGORY_KEY[category]);

  function clearTitle() {
    setTitle('');
    titleInputRef.current?.focus();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <Text style={[styles.sheetTitle, { color: theme.primaryText }]}>{t('waypoint.add')}</Text>
          <Text style={[styles.sheetSubtitle, { color: theme.mutedText }]}>
            {t('waypoint.subtitle')}
          </Text>

          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Title */}
            <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>{t('waypoint.titleRequiredLabel').toUpperCase()}</Text>
            <View style={[styles.titleInputCard, { backgroundColor: theme.card }]}>
              <TextInput
                ref={titleInputRef}
                style={[styles.titleInput, { color: theme.primaryText }]}
                value={title}
                onChangeText={setTitle}
                placeholder={t('waypoint.titlePlaceholder')}
                placeholderTextColor={theme.mutedText}
                accessibilityLabel={t('waypoint.titleAccessibility')}
              />
              {title.length > 0 ? (
                <Pressable
                  style={styles.clearTitleButton}
                  onPress={clearTitle}
                  accessibilityRole="button"
                  accessibilityLabel={t('waypoint.clearTitle')}
                  hitSlop={4}
                >
                  <MaterialIcons name="close" size={20} color={theme.mutedText} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.suggestionRow}>
              <Text style={[styles.suggestionText, { color: theme.mutedText }]} numberOfLines={1}>
                {t('waypoint.suggested')} {suggestedTitle}
              </Text>
              <Pressable
                style={[styles.useSuggestionButton, { borderColor: theme.border }]}
                onPress={() => setTitle(suggestedTitle)}
                accessibilityRole="button"
                accessibilityLabel={`${t('waypoint.useSuggestion')} ${suggestedTitle}`}
              >
                <Text style={[styles.useSuggestionText, { color: theme.accent }]}>{t('common.use')}</Text>
              </Pressable>
            </View>

            {/* Category */}
            <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>{t('waypoint.category').toUpperCase()}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {CATEGORY_ORDER.map((cat) => {
                const selected = cat === category;
                return (
                  <Pressable
                    key={cat}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? theme.accent : theme.card,
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <MaterialIcons
                      name={CATEGORY_ICON[cat]}
                      size={16}
                      color={selected ? theme.background : theme.primaryText}
                    />
                    <Text style={[styles.chipText, { color: selected ? theme.background : theme.primaryText }]}>
                      {t(CATEGORY_KEY[cat])}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Note */}
            <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>{t('waypoint.note').toUpperCase()}</Text>
            <TextInput
              style={[styles.inputCard, styles.inputMulti, { backgroundColor: theme.card, color: theme.primaryText }]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('waypoint.notePlaceholder')}
              placeholderTextColor={theme.mutedText}
              multiline
              textAlignVertical="top"
            />

            {/* Photos */}
            <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>{t('waypoint.photos').toUpperCase()}</Text>
            <Text style={[styles.photosHint, { color: theme.mutedText }]}>
              {t('waypoint.photosHint')}
            </Text>
            <View style={styles.photoButtons}>
              <Pressable style={[styles.photoActionBtn, { backgroundColor: theme.accent }]} onPress={() => void onCamera()}>
                <Text style={[styles.photoActionText, { color: theme.background }]}>{t('waypoint.takePhoto')}</Text>
              </Pressable>
              <Pressable style={[styles.photoActionBtn, { backgroundColor: theme.accent }]} onPress={() => void onGallery()}>
                <Text style={[styles.photoActionText, { color: theme.background }]}>{t('waypoint.addPhotos')}</Text>
              </Pressable>
            </View>

            {photos.length > 0 && (
              <View style={styles.thumbGrid}>
                {photos.map((p, i) => (
                  <View key={i} style={styles.thumbWrapper}>
                    <Image source={{ uri: p.uri }} style={styles.thumb} />
                    <PhotoVerificationIndicator
                      capturedAt={p.capturedAt}
                      photoCoordinates={p.coordinates}
                      style={styles.verificationBadge}
                      waypointCoordinates={p.waypointCoordinates}
                      waypointCreatedAt={p.waypointCreatedAt}
                    />
                    <Pressable style={[styles.removeBadge, { backgroundColor: theme.dangerMuted }]} onPress={() => removePhoto(i)}>
                      <Text style={[styles.removeBadgeText, { color: theme.danger }]}>{t('common.remove')}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {error ? (
              <View style={styles.errorBlock}>
                <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
                {premiumError ? (
                  <Pressable onPress={onViewPremium}>
                    <Text style={[styles.premiumLink, { color: theme.accent }]}>{t('premium.viewOptions')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom actions */}
          <View style={[styles.actions, { borderTopColor: theme.border }]}>
            <Pressable style={[styles.cancelBtn, { backgroundColor: theme.accentMuted }]} onPress={onCancel} disabled={loading}>
              <Text style={[styles.cancelBtnText, { color: theme.primaryText }]}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, { backgroundColor: canSave ? theme.accent : theme.mutedText }]}
              onPress={() => void onSave()}
              disabled={!canSave}
            >
              {loading
                ? <ActivityIndicator color={theme.background} size="small" />
                : <Text style={[styles.saveBtnText, { color: theme.background }]}>{t('waypoint.save')}</Text>
              }
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 18, 10, 0.5)' },

  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingHorizontal: 24,
    paddingBottom: 0,
  },

  handle: {
    width: 44, height: 5, borderRadius: 999,
    alignSelf: 'center', marginTop: 12, marginBottom: 20,
  },

  sheetTitle: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
  sheetSubtitle: { fontSize: 14, lineHeight: 20, marginBottom: 4 },

  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: 16 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    marginTop: 20, marginBottom: 8,
  },

  inputCard: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  titleInputCard: {
    minHeight: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleInput: {
    flex: 1,
    paddingLeft: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  clearTitleButton: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  suggestionText: { flex: 1, fontSize: 13 },
  useSuggestionButton: {
    minWidth: 56,
    minHeight: 40,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
  },
  useSuggestionText: { fontSize: 14, fontWeight: '700' },
  inputMulti: { minHeight: 100, paddingTop: 14 },

  chipScroll: { flexDirection: 'row' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    marginRight: 8,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 14, fontWeight: '600' },

  photosHint: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  verificationBadge: { left: 6, position: 'absolute', top: 6 },
  photoButtons: { flexDirection: 'row', gap: 10 },
  photoActionBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
  },
  photoActionText: { fontSize: 15, fontWeight: '700' },

  thumbGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  thumbWrapper: { position: 'relative' },
  thumb: { width: 120, height: 120, borderRadius: 14 },
  removeBadge: {
    position: 'absolute', top: 8, right: 8,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
  },
  removeBadgeText: { fontSize: 12, fontWeight: '700' },

  errorBlock: { gap: 8, marginTop: 12 },
  error: { fontSize: 13 },
  premiumLink: { fontSize: 14, fontWeight: '800' },

  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700' },
  saveBtn: {
    flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700' },
});
