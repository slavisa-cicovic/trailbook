import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Image, Pressable, StyleSheet,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Marker } from 'react-native-maps';
import { useWaypointDetailStore } from '@/feature/waypoint/waypointDetailStore';
import { EditWaypointSheet } from './components/EditWaypointSheet';
import { addPhotoToWaypoint } from '@/core/domain/usecase/AddPhotoToWaypointUseCase';
import { BottomNav } from '@/components/ui/BottomNav';
import { TrailMap } from '@/components/ui/TrailMap';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { CATEGORY_ICON } from '@/constants/waypointCategories';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_HEIGHT = Math.round(SCREEN_WIDTH * 0.65);
const BOTTOM_NAV_HEIGHT = 64;

export default function WaypointDetailScreen() {
  const { waypointId } = useLocalSearchParams<{ waypointId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();

  const load = useWaypointDetailStore((s) => s.load);
  const reload = useWaypointDetailStore((s) => s.reload);
  const reset = useWaypointDetailStore((s) => s.reset);
  const waypoint = useWaypointDetailStore((s) => s.waypoint);
  const images = useWaypointDetailStore((s) => s.images);
  const prevId = useWaypointDetailStore((s) => s.prevId);
  const nextId = useWaypointDetailStore((s) => s.nextId);
  const loading = useWaypointDetailStore((s) => s.loading);

  const [showEditSheet, setShowEditSheet] = useState(false);
  useEffect(() => {
    if (waypointId) load(waypointId);
    return () => reset();
  }, [waypointId]);

  function navigateTo(id: string) {
    router.replace(`/waypoint/${id}`);
  }

  async function onAddPhoto() {
    if (!waypoint) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (result.canceled) return;
    for (const asset of result.assets) {
      await addPhotoToWaypoint(waypoint.id, asset.uri, 'GALLERY', null);
    }
    reload();
  }

  if (loading || !waypoint) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const pillBottom = BOTTOM_NAV_HEIGHT + insets.bottom + 12;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <TopAppBar onBack={() => router.back()} title="Waypoint" />

      {/* Scrollable content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: pillBottom + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Photos section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.primaryText }]}>Photos</Text>
          <Pressable
            style={[styles.addPhotoBtn, { backgroundColor: theme.accentMuted }]}
            onPress={() => void onAddPhoto()}
          >
            <Text style={[styles.addPhotoBtnText, { color: theme.primaryText }]}>Add photo(s)</Text>
          </Pressable>
        </View>
        <Text style={[styles.photoHint, { color: theme.mutedText }]}>
          Tap a photo to open full screen.
        </Text>

        {images.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRail}
            style={styles.photoRailWrap}
            decelerationRate="fast"
            snapToInterval={SCREEN_WIDTH - 48}
            snapToAlignment="start"
          >
            {images.map((img) => (
              <Pressable
                key={img.id}
                onPress={() => router.push(`/waypoint/${waypoint.id}/photo/${img.id}`)}
              >
                <Image
                  source={{ uri: img.localUri }}
                  style={[
                    styles.photo,
                    { backgroundColor: theme.accentMuted, height: PHOTO_HEIGHT },
                  ]}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.emptyPhotos, { backgroundColor: theme.accentMuted }]}>
            <MaterialIcons name="photo-camera" size={32} color={theme.mutedText} />
            <Text style={[styles.emptyPhotosText, { color: theme.mutedText }]}>No photos yet</Text>
          </View>
        )}

        {/* Location section */}
        <Text style={[styles.sectionTitle, { color: theme.primaryText, marginTop: 24 }]}>Location</Text>
        <View style={[styles.miniMapCard, { backgroundColor: theme.card }]}>
          <TrailMap
            style={styles.miniMap}
            switcherPosition="none"
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            initialRegion={{
              latitude: waypoint.latitude,
              longitude: waypoint.longitude,
              latitudeDelta: 0.012,
              longitudeDelta: 0.012,
            }}
          >
            <Marker
              coordinate={{ latitude: waypoint.latitude, longitude: waypoint.longitude }}
              pinColor={theme.accent}
            />
          </TrailMap>
        </View>
      </ScrollView>

      {/* Bottom pill */}
      <View
        pointerEvents="box-none"
        style={[styles.pillWrap, { bottom: pillBottom }]}
      >
        <View style={styles.pill}>
          <Pressable
            style={[styles.navBtn, !prevId && styles.navBtnDisabled]}
            onPress={() => prevId && navigateTo(prevId)}
            disabled={!prevId}
          >
            <MaterialIcons name="chevron-left" size={24} color={prevId ? '#243224' : '#9aa596'} />
          </Pressable>

          <Pressable style={styles.pillCenter} onPress={() => setShowEditSheet(true)}>
            <MaterialIcons name={CATEGORY_ICON[waypoint.category]} size={18} color={theme.accent} />
            <Text style={styles.pillTitle} numberOfLines={1}>{waypoint.title}</Text>
          </Pressable>

          <Pressable
            style={[styles.navBtn, !nextId && styles.navBtnDisabled]}
            onPress={() => nextId && navigateTo(nextId)}
            disabled={!nextId}
          >
            <MaterialIcons name="chevron-right" size={24} color={nextId ? '#243224' : '#9aa596'} />
          </Pressable>
        </View>
      </View>

      <BottomNav />

      <EditWaypointSheet
        waypoint={waypoint}
        visible={showEditSheet}
        onDismiss={() => setShowEditSheet(false)}
        onSaved={() => reload()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 22, fontWeight: '800' },
  addPhotoBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addPhotoBtnText: { fontSize: 14, fontWeight: '600' },

  photoHint: { fontSize: 14, lineHeight: 20, marginBottom: 12 },

  photoRailWrap: { marginHorizontal: -20 },
  photoRail: { paddingHorizontal: 20, gap: 12 },
  photo: {
    width: SCREEN_WIDTH - 72,
    borderRadius: 24,
  },

  emptyPhotos: {
    height: 140,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  emptyPhotosText: { fontSize: 14 },

  miniMapCard: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 180,
    marginTop: 10,
  },
  miniMap: { flex: 1 },

  // Pill
  pillWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  pill: {
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(235, 225, 207, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#142014',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(230, 236, 225, 0.9)',
  },
  navBtnDisabled: { opacity: 0.42 },
  pillCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10 },
  pillTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#243224' },
});
