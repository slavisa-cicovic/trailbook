import * as FileSystem from 'expo-file-system/legacy';

const PHOTOS_DIR = `${FileSystem.documentDirectory}waypoint_photos/`;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export async function saveRestoredPhoto(
  waypointId: string,
  imageId: string,
  bytes: Uint8Array,
): Promise<string> {
  const dir = `${PHOTOS_DIR}${waypointId}/`;
  const path = `${dir}${imageId}.jpg`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await FileSystem.writeAsStringAsync(path, uint8ArrayToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return path;
}

export async function deleteAllPhotos(): Promise<void> {
  await FileSystem.deleteAsync(PHOTOS_DIR, { idempotent: true });
}
