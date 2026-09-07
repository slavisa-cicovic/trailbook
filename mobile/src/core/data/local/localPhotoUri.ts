const WAYPOINT_PHOTOS_PATH = 'waypoint_photos/';

function waypointPhotoRelativePath(uri: string): string | null {
  if (uri.startsWith(WAYPOINT_PHOTOS_PATH)) return uri;

  const marker = `/${WAYPOINT_PHOTOS_PATH}`;
  const markerIndex = uri.lastIndexOf(marker);
  return markerIndex >= 0 ? uri.slice(markerIndex + 1) : null;
}

export function persistableLocalPhotoUri(uri: string): string {
  return waypointPhotoRelativePath(uri) ?? uri;
}

export function resolvedLocalPhotoUri(
  storedUri: string,
  documentDirectory: string | null,
): string {
  const relativePath = waypointPhotoRelativePath(storedUri);
  return relativePath && documentDirectory
    ? `${documentDirectory}${relativePath}`
    : storedUri;
}
