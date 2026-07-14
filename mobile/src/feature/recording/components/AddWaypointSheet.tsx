import { useState } from 'react';
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

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const CATEGORIES: WaypointCategory[] = [
  'GENERIC', 'DEPARTURE', 'FUEL', 'BORDER', 'PORT',
  'FERRY', 'RESTAURANT', 'CAFE', 'VIEWPOINT', 'MONUMENT', 'BEACH',
];

const CATEGORY_LABEL: Record<WaypointCategory, string> = {
  GENERIC: 'Note', DEPARTURE: 'Departure', FUEL: 'Fuel',
  BORDER: 'Border', PORT: 'Port', FERRY: 'Ferry',
  RESTAURANT: 'Restaurant', CAFE: 'Cafe', VIEWPOINT: 'Viewpoint',
  MONUMENT: 'Monument', BEACH: 'Beach',
};

const CATEGORY_ICON: Record<WaypointCategory, IconName> = {
  GENERIC: 'location-on', DEPARTURE: 'home', FUEL: 'local-gas-station',
  BORDER: 'security', PORT: 'anchor', FERRY: 'directions-boat',
  RESTAURANT: 'restaurant', CAFE: 'local-cafe', VIEWPOINT: 'visibility',
  MONUMENT: 'account-balance', BEACH: 'beach-access',
};

interface PhotoItem {
  uri: string;
  source: ImageSource;
  capturedAt: Date | null;
}

interface Props {
  tripId: string;
  visible: boolean;
  onDismiss(): void;
}

export function AddWaypointSheet({ tripId, visible, onDismiss }: Props) {
  const [category, setCategory] = useState<WaypointCategory>('GENERIC');
  const [title, setTitle] = useState('Note');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const router = useRouter();

  function onSelectCategory(cat: WaypointCategory) {
    setCategory(cat);
    setTitle(CATEGORY_LABEL[cat]);
  }

  async function onCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: 'Camera permission required' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: false });
    if (!result.canceled && result.assets[0]) {
      setPhotos((p) => [...p, { uri: result.assets[0]!.uri, source: 'CAMERA', capturedAt: new Date() }]);
    }
  }

  async function onGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert({ title: 'Photo library permission required' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setPhotos((p) => [...p, { uri: result.assets[0]!.uri, source: 'GALLERY', capturedAt: null }]);
    }
  }

  function removePhoto(index: number) {
    setPhotos((p) => p.filter((_, i) => i !== index));
  }

  async function onSave() {
    if (!title.trim()) { setError('Title is required'); return; }
    setLoading(true);
    setError(null);
    const result = await addWaypoint({ tripId, title: title.trim(), description: description.trim() || null, category, photos });
    setLoading(false);
    if (!result.ok) {
      setError(accessErrorMessage(result.error));
    } else {
      reset();
      onDismiss();
    }
  }

  function reset() {
    setCategory('GENERIC');
    setTitle('Note');
    setDescription('');
    setPhotos([]);
    setError(null);
  }

  function onCancel() { reset(); onDismiss(); }

  function onViewPremium() {
    onCancel();
    setTimeout(() => router.push('/premium'), 250);
  }

  const canSave = title.trim().length > 0 && !loading;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <Text style={[styles.sheetTitle, { color: theme.primaryText }]}>Add waypoint</Text>
          <Text style={[styles.sheetSubtitle, { color: theme.mutedText }]}>
            Save a quick waypoint for this route using your current location.
          </Text>

          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Title */}
            <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>TITLE</Text>
            <TextInput
              style={[styles.inputCard, { backgroundColor: theme.card, color: theme.primaryText }]}
              value={title}
              onChangeText={setTitle}
              placeholder="Viewpoint"
              placeholderTextColor={theme.mutedText}
            />

            {/* Category */}
            <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {CATEGORIES.map((cat) => {
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
                    onPress={() => onSelectCategory(cat)}
                  >
                    <MaterialIcons
                      name={CATEGORY_ICON[cat]}
                      size={16}
                      color={selected ? theme.background : theme.primaryText}
                    />
                    <Text style={[styles.chipText, { color: selected ? theme.background : theme.primaryText }]}>
                      {CATEGORY_LABEL[cat]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Note */}
            <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>NOTE</Text>
            <TextInput
              style={[styles.inputCard, styles.inputMulti, { backgroundColor: theme.card, color: theme.primaryText }]}
              value={description}
              onChangeText={setDescription}
              placeholder="What do you want to remember here?"
              placeholderTextColor={theme.mutedText}
              multiline
              textAlignVertical="top"
            />

            {/* Photos */}
            <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>PHOTOS</Text>
            <Text style={[styles.photosHint, { color: theme.mutedText }]}>
              Add one or more photos from the camera or your library.
            </Text>
            <View style={styles.photoButtons}>
              <Pressable style={[styles.photoActionBtn, { backgroundColor: theme.accent }]} onPress={() => void onCamera()}>
                <Text style={[styles.photoActionText, { color: theme.background }]}>Take photo</Text>
              </Pressable>
              <Pressable style={[styles.photoActionBtn, { backgroundColor: theme.accent }]} onPress={() => void onGallery()}>
                <Text style={[styles.photoActionText, { color: theme.background }]}>Add photos</Text>
              </Pressable>
            </View>

            {photos.length > 0 && (
              <View style={styles.thumbGrid}>
                {photos.map((p, i) => (
                  <View key={i} style={styles.thumbWrapper}>
                    <Image source={{ uri: p.uri }} style={styles.thumb} />
                    <Pressable style={[styles.removeBadge, { backgroundColor: theme.dangerMuted }]} onPress={() => removePhoto(i)}>
                      <Text style={[styles.removeBadgeText, { color: theme.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {error ? (
              <View style={styles.errorBlock}>
                <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
                {isPremiumAccessError(error) ? (
                  <Pressable onPress={onViewPremium}>
                    <Text style={[styles.premiumLink, { color: theme.accent }]}>View Premium options</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          {/* Bottom actions */}
          <View style={[styles.actions, { borderTopColor: theme.border }]}>
            <Pressable style={[styles.cancelBtn, { backgroundColor: theme.accentMuted }]} onPress={onCancel} disabled={loading}>
              <Text style={[styles.cancelBtnText, { color: theme.primaryText }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, { backgroundColor: canSave ? theme.accent : theme.mutedText }]}
              onPress={() => void onSave()}
              disabled={!canSave}
            >
              {loading
                ? <ActivityIndicator color={theme.background} size="small" />
                : <Text style={[styles.saveBtnText, { color: theme.background }]}>Save waypoint</Text>
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
