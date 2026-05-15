import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

export interface PickedPhoto {
  fileSize: number | null;
  localUri: string;
  mimeType: string | null;
}

const PHOTO_STORAGE_DIR = `${FileSystem.documentDirectory}waypoint-photos`;

async function ensurePhotoStorageDirectory() {
  await FileSystem.makeDirectoryAsync(PHOTO_STORAGE_DIR, { intermediates: true });
}

function resolvePhotoExtensionFromMimeType(mimeType: string | null) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
    case "image/heif":
      return ".heic";
    default:
      return ".jpg";
  }
}

function resolvePhotoExtension(asset: ImagePicker.ImagePickerAsset) {
  const uriMatch = asset.uri.match(/\.[a-zA-Z0-9]+(?=($|\?))/);

  if (uriMatch?.[0]) {
    return uriMatch[0].toLowerCase();
  }

  return resolvePhotoExtensionFromMimeType(asset.mimeType ?? null);
}

async function normalizePhotoAsset(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  await ensurePhotoStorageDirectory();

  const fileName = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${resolvePhotoExtension(asset)}`;
  const destination = `${PHOTO_STORAGE_DIR}/${fileName}`;

  await FileSystem.copyAsync({
    from: asset.uri,
    to: destination,
  });

  return {
    localUri: destination,
    mimeType: asset.mimeType ?? null,
    fileSize: asset.fileSize ?? null,
  };
}

export async function pickPhotoFromLibrary(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: false,
    selectionLimit: 1,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return normalizePhotoAsset(result.assets[0]);
}

export async function pickPhotosFromLibrary(): Promise<PickedPhoto[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    return [];
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: 10,
  });

  if (result.canceled || result.assets.length === 0) {
    return [];
  }

  return Promise.all(result.assets.map((asset) => normalizePhotoAsset(asset)));
}

export async function capturePhotoWithCamera(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();

  if (!permission.granted) {
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: false,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  return normalizePhotoAsset(result.assets[0]);
}

export async function downloadPhotoToLocalStorage(input: {
  fileNameSeed: string;
  mimeType: string | null;
  sourceUrl: string;
}): Promise<PickedPhoto> {
  await ensurePhotoStorageDirectory();

  const safeFileNameSeed = input.fileNameSeed.replace(/[^a-zA-Z0-9_-]/g, "-");
  const destination = `${PHOTO_STORAGE_DIR}/${safeFileNameSeed}${resolvePhotoExtensionFromMimeType(input.mimeType)}`;
  const result = await FileSystem.downloadAsync(input.sourceUrl, destination);
  const fileInfo = await FileSystem.getInfoAsync(result.uri);

  return {
    localUri: result.uri,
    mimeType: input.mimeType,
    fileSize: fileInfo.exists && !fileInfo.isDirectory ? fileInfo.size : null,
  };
}
