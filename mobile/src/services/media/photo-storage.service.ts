import * as FileSystem from "expo-file-system/legacy";

const PHOTO_STORAGE_DIRECTORY_NAME = "waypoint-photos";

export function getPhotoStorageDirectory(): string {
  return `${FileSystem.documentDirectory ?? ""}${PHOTO_STORAGE_DIRECTORY_NAME}`;
}

export async function ensurePhotoStorageDirectory() {
  await FileSystem.makeDirectoryAsync(getPhotoStorageDirectory(), { intermediates: true });
}

export function buildPhotoStorageUri(fileName: string): string {
  return `${getPhotoStorageDirectory()}/${fileName}`;
}

export function resolveStoredPhotoUri(uri: string): string {
  if (!uri.startsWith("file://")) {
    return uri;
  }

  const marker = `/${PHOTO_STORAGE_DIRECTORY_NAME}/`;
  const markerIndex = uri.indexOf(marker);

  if (markerIndex === -1 || !FileSystem.documentDirectory) {
    return uri;
  }

  return `${getPhotoStorageDirectory()}/${uri.slice(markerIndex + marker.length)}`;
}
