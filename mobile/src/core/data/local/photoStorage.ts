import * as FileSystem from 'expo-file-system/legacy';
import { SingleFlight } from '@/core/common/singleFlight';

const PHOTOS_DIR = `${FileSystem.documentDirectory}waypoint_photos/`;
const SHARED_PHOTOS_DIR = `${FileSystem.documentDirectory}shared_waypoint_photos/`;
const SHARED_PHOTO_DOWNLOAD_TIMEOUT_MS = 20_000;
const sharedPhotoDownloads = new SingleFlight<string, string>();

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

export async function cacheSharedPhoto(imageId: string, remoteUri: string): Promise<string> {
  const safeImageId = imageId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${SHARED_PHOTOS_DIR}${safeImageId}`;
  const existing = await FileSystem.getInfoAsync(path);
  if (existing.exists && (existing.size ?? 0) > 0) return path;

  return sharedPhotoDownloads.run(path, () => downloadSharedPhoto(remoteUri, path));
}

async function downloadSharedPhoto(remoteUri: string, path: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(SHARED_PHOTOS_DIR, { intermediates: true });
  const temporaryPath = `${path}.download`;
  await FileSystem.deleteAsync(temporaryPath, { idempotent: true });
  const task = FileSystem.createDownloadResumable(remoteUri, temporaryPath);
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      task.downloadAsync(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          void task.cancelAsync().catch(() => undefined);
          reject(new Error('Photo download timed out'));
        }, SHARED_PHOTO_DOWNLOAD_TIMEOUT_MS);
      }),
    ]);
    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(`Photo download failed${result ? ` (HTTP ${result.status})` : ''}`);
    }
    const downloaded = await FileSystem.getInfoAsync(temporaryPath);
    if (!downloaded.exists || (downloaded.size ?? 0) === 0) {
      throw new Error('Photo download returned an empty file');
    }

    await FileSystem.deleteAsync(path, { idempotent: true });
    await FileSystem.moveAsync({ from: temporaryPath, to: path });
    return path;
  } finally {
    if (timeout) clearTimeout(timeout);
    await FileSystem.deleteAsync(temporaryPath, { idempotent: true }).catch(() => undefined);
  }
}

export async function deleteAllPhotos(): Promise<void> {
  await Promise.all([
    FileSystem.deleteAsync(PHOTOS_DIR, { idempotent: true }),
    FileSystem.deleteAsync(SHARED_PHOTOS_DIR, { idempotent: true }),
  ]);
}

export async function deletePhotosForWaypoints(waypointIds: string[]): Promise<void> {
  await Promise.all(
    waypointIds.map((waypointId) =>
      FileSystem.deleteAsync(`${PHOTOS_DIR}${waypointId}/`, { idempotent: true }),
    ),
  );
}
