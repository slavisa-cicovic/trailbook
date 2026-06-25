import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Trip } from '@/core/domain/model/trip';
import type { Waypoint, WaypointImage } from '@/core/domain/model/waypoint';
import * as tripDao from '@/core/data/local/tripDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';
import { deleteWaypointPhoto } from '@/core/domain/usecase/DeleteWaypointPhotoUseCase';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import { WaypointPhotoViewer } from './components/WaypointPhotoViewer';

interface ViewerModel {
  images: WaypointImage[];
  nextWaypoint: Waypoint | null;
  previousWaypoint: Waypoint | null;
  routeCoordinates: Array<{ latitude: number; longitude: number }>;
  trip: Trip;
  waypoint: Waypoint;
}

export default function WaypointPhotoViewerScreen() {
  const { waypointId, imageId } = useLocalSearchParams<{
    waypointId: string;
    imageId: string;
  }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const [model, setModel] = useState<ViewerModel | null>(null);
  const [loading, setLoading] = useState(true);

  const loadModel = useCallback(async () => {
    if (!waypointId) return;
    setLoading(true);
    const waypoint = await waypointDao.getById(waypointId);
    if (!waypoint) {
      setModel(null);
      setLoading(false);
      return;
    }

    const [trip, images, siblings, locations] = await Promise.all([
      tripDao.getTripByClientId(waypoint.tripId),
      waypointImageDao.getForWaypoint(waypoint.id),
      waypointDao.getForTrip(waypoint.tripId),
      rawLocationDao.getAllForTrip(waypoint.tripId),
    ]);
    if (!trip) {
      setModel(null);
      setLoading(false);
      return;
    }

    const sorted = siblings.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const waypointIndex = sorted.findIndex((candidate) => candidate.id === waypoint.id);
    setModel({
      images,
      nextWaypoint: waypointIndex < sorted.length - 1 ? sorted[waypointIndex + 1] : null,
      previousWaypoint: waypointIndex > 0 ? sorted[waypointIndex - 1] : null,
      routeCoordinates: locations.map((location) => ({
        latitude: location.latitude,
        longitude: location.longitude,
      })),
      trip,
      waypoint,
    });
    setLoading(false);
  }, [waypointId]);

  useEffect(() => {
    void loadModel();
  }, [imageId, loadModel]);

  function navigateToWaypoint(waypoint: Waypoint, direction: 'next' | 'previous') {
    void waypointImageDao.getForWaypoint(waypoint.id).then((images) => {
      const firstImage = images[0];
      if (firstImage) {
        router.replace(`/waypoint/${waypoint.id}/photo/${firstImage.id}?transition=${direction}`);
      } else {
        router.replace(`/waypoint/${waypoint.id}`);
      }
    });
  }

  async function removeCurrentImage(selectedImageId: string) {
    if (!model) return;
    const image = model.images.find((candidate) => candidate.id === selectedImageId);
    if (!image) return;

    const currentIndex = model.images.findIndex((candidate) => candidate.id === selectedImageId);
    const fallback = model.images[currentIndex + 1] ?? model.images[currentIndex - 1] ?? null;
    const result = await deleteWaypointPhoto(model.waypoint.id, selectedImageId);
    if (!result.ok) {
      showAlert({ title: 'Remove failed', message: result.error });
      return;
    }

    if (fallback) {
      router.replace(`/waypoint/${model.waypoint.id}/photo/${fallback.id}`);
    } else {
      router.back();
    }
  }

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!model || model.images.length === 0) {
    return null;
  }

  return (
    <WaypointPhotoViewer
      images={model.images}
      nextWaypointTitle={model.nextWaypoint?.title}
      onBack={() => router.back()}
      onNextWaypoint={
        model.nextWaypoint
          ? () => navigateToWaypoint(model.nextWaypoint!, 'next')
          : undefined
      }
      onPreviousWaypoint={
        model.previousWaypoint
          ? () => navigateToWaypoint(model.previousWaypoint!, 'previous')
          : undefined
      }
      onRemoveCurrent={(selectedImageId) => {
        showAlert({
          title: 'Remove photo?',
          message: 'This removes the photo from this waypoint.',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () => void removeCurrentImage(selectedImageId),
            },
          ],
        });
      }}
      previousWaypointTitle={model.previousWaypoint?.title}
      routeCoordinates={model.routeCoordinates}
      selectedImageId={imageId ?? null}
      tripTitle={model.trip.title}
      waypointCoordinate={{
        latitude: model.waypoint.latitude,
        longitude: model.waypoint.longitude,
      }}
      waypointTitle={model.waypoint.title}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
