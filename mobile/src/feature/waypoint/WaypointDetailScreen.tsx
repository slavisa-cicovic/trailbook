import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, ScrollView, Image, Pressable, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWaypointDetailStore } from '@/feature/waypoint/waypointDetailStore';
import { EditWaypointSheet } from './components/EditWaypointSheet';
import { deleteWaypoint } from '@/core/domain/usecase/DeleteWaypointUseCase';
import ScreenLayout from '@/components/layout/screen-layout';
import IconButton from '@/components/ui/icon-button';
import { useAppTheme } from '@/hooks/useAppTheme';

export default function WaypointDetailScreen() {
  const { waypointId } = useLocalSearchParams<{ waypointId: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();

  const load = useWaypointDetailStore((s) => s.load);
  const reload = useWaypointDetailStore((s) => s.reload);
  const reset = useWaypointDetailStore((s) => s.reset);
  const waypoint = useWaypointDetailStore((s) => s.waypoint);
  const images = useWaypointDetailStore((s) => s.images);
  const loading = useWaypointDetailStore((s) => s.loading);

  const [showEditSheet, setShowEditSheet] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (waypointId) load(waypointId);
    return () => reset();
  }, [waypointId]);

  function confirmDelete() {
    Alert.alert('Delete waypoint?', 'This will also remove all photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!waypointId) return;
          setDeleting(true);
          const result = await deleteWaypoint(waypointId);
          setDeleting(false);
          if (!result.ok) Alert.alert('Delete failed', result.error);
          else router.back();
        },
      },
    ]);
  }

  if (loading || !waypoint) {
    return (
      <ScreenLayout onBack={() => router.back()}>
        <ActivityIndicator color={theme.accent} />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title={waypoint.title} onBack={() => router.back()} scrollEnabled>
      {/* Photos */}
      {images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.photoRail}
          style={styles.photoRailWrap}
        >
          {images.map((img) => (
            <Image key={img.id} source={{ uri: img.localUri }} style={[styles.photo, { backgroundColor: theme.accentMuted }]} />
          ))}
        </ScrollView>
      )}

      {/* Details */}
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.mutedText }]}>Category</Text>
          <Text style={[styles.infoValue, { color: theme.primaryText }]}>{waypoint.category}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: theme.mutedText }]}>Coordinates</Text>
          <Text style={[styles.infoValue, { color: theme.primaryText }]}>
            {waypoint.latitude.toFixed(5)}, {waypoint.longitude.toFixed(5)}
          </Text>
        </View>
        {waypoint.description ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.infoCol}>
              <Text style={[styles.infoLabel, { color: theme.mutedText }]}>Notes</Text>
              <Text style={[styles.descText, { color: theme.primaryText }]}>{waypoint.description}</Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.editBtn, { backgroundColor: theme.accent }, deleting && { opacity: 0.4 }]}
          onPress={() => setShowEditSheet(true)}
          disabled={deleting}
        >
          <Text style={[styles.editBtnText, { color: theme.background }]}>Edit</Text>
        </Pressable>
        <IconButton icon="delete" variant="danger" size="lg" onPress={confirmDelete} disabled={deleting} />
      </View>

      <EditWaypointSheet
        waypoint={waypoint}
        visible={showEditSheet}
        onDismiss={() => setShowEditSheet(false)}
        onSaved={() => reload()}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  photoRailWrap: { marginBottom: 12 },
  photoRail: { gap: 10, paddingHorizontal: 2 },
  photo: { width: 200, height: 150, borderRadius: 18 },
  card: {
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoCol: { paddingVertical: 12 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 15, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth },
  descText: { fontSize: 15, marginTop: 6, lineHeight: 22 },
  actionRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  editBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  editBtnText: { fontSize: 16, fontWeight: '700' },
});
