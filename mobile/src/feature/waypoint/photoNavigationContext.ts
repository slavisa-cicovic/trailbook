import type { WaypointImage } from '@/core/domain/model/waypoint';

export interface PhotoViewerItem extends WaypointImage {
  readOnly?: boolean;
  routeCoordinateGroups: Array<Array<{ latitude: number; longitude: number }>>;
  tripTitle: string;
  waypointCoordinate: { latitude: number; longitude: number };
  waypointTitle: string;
}

const contexts = new Map<string, PhotoViewerItem[]>();

export function savePhotoNavigationContext(items: PhotoViewerItem[]): string {
  const id = `photo-context-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  contexts.set(id, items);
  return id;
}

export function getPhotoNavigationContext(id: string | null | undefined): PhotoViewerItem[] | null {
  if (!id) return null;
  return contexts.get(id) ?? null;
}

export function clearPhotoNavigationContext(id: string | null | undefined): void {
  if (!id) return;
  contexts.delete(id);
}
