import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as displayRoutePointDao from '@/core/data/local/displayRoutePointDao';
import { buildDisplayRouteCoordinateGroups } from '@/core/domain/processing/displayRouteBuilder';
import * as tripDao from '@/core/data/local/tripDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { deleteWaypointPhoto } from '@/core/domain/usecase/DeleteWaypointPhotoUseCase';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import { WaypointPhotoViewer } from './components/WaypointPhotoViewer';
import {
  getPhotoNavigationContext,
  type PhotoViewerItem,
} from './photoNavigationContext';

export default function WaypointPhotoViewerScreen() {
  const { waypointId, imageId, photoContextId } = useLocalSearchParams<{
    waypointId: string;
    imageId: string;
    photoContextId?: string;
  }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const [images, setImages] = useState<PhotoViewerItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadImages = useCallback(async (cancelled: () => boolean) => {
    if (!waypointId || cancelled()) return;
    setLoading(true);

    const context = getPhotoNavigationContext(
      Array.isArray(photoContextId) ? photoContextId[0] : photoContextId,
    );
    if (context) {
      setImages(context);
      setLoading(false);
      return;
    }

    const waypoint = await waypointDao.getById(waypointId);
    if (!waypoint || cancelled()) {
      setImages([]);
      setLoading(false);
      return;
    }

    const [trip, waypointImages, routePoints] = await Promise.all([
      tripDao.getTripByClientId(waypoint.tripId),
      waypointImageDao.getForWaypoint(waypoint.id),
      displayRoutePointDao.getForTrip(waypoint.tripId),
    ]);
    if (!trip || cancelled()) {
      setImages([]);
      setLoading(false);
      return;
    }

    const routeCoordinateGroups = buildDisplayRouteCoordinateGroups(routePoints);
    setImages(
      waypointImages.map((image) => ({
        ...image,
        routeCoordinateGroups,
        tripTitle: trip.title,
        waypointCoordinate: {
          latitude: waypoint.latitude,
          longitude: waypoint.longitude,
        },
        waypointCreatedAt: waypoint.createdAt,
        waypointTitle: waypoint.title,
      })),
    );
    setLoading(false);
  }, [photoContextId, waypointId]);

  useEffect(() => {
    let cancelled = false;
    void loadImages(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [imageId, loadImages]);

  async function removeCurrentImage(selectedImageId: string) {
    const image = images.find((candidate) => candidate.id === selectedImageId);
    if (!image) return;

    const currentIndex = images.findIndex((candidate) => candidate.id === selectedImageId);
    const fallback = images[currentIndex + 1] ?? images[currentIndex - 1] ?? null;
    const result = await deleteWaypointPhoto(image.waypointId, selectedImageId);
    if (!result.ok) {
      showAlert({ title: 'Remove failed', message: result.error });
      return;
    }

    if (fallback) {
      router.replace(`/waypoint/${fallback.waypointId}/photo/${fallback.id}`);
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

  if (images.length === 0) {
    return null;
  }

  return (
    <WaypointPhotoViewer
      images={images}
      onBack={() => router.back()}
      onRemoveCurrent={
        images.find((image) => image.id === imageId)?.readOnly
          ? undefined
          : (selectedImageId) => {
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
            }
      }
      selectedImageId={imageId ?? null}
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
