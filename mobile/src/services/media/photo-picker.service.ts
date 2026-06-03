import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import {
  buildPhotoStorageUri,
  ensurePhotoStorageDirectory,
} from "./photo-storage.service";
import { getTrailbookPermissionStatus } from "../permissions/permission-manager.service";

export interface PickedPhoto {
  fileSize: number | null;
  localUri: string;
  mimeType: string | null;
}

export class CameraPermissionDeniedError extends Error {
  canAskAgain: boolean;

  constructor(canAskAgain: boolean) {
    super("Camera permission denied");
    this.name = "CameraPermissionDeniedError";
    this.canAskAgain = canAskAgain;
  }
}

export function isCameraPermissionDeniedError(error: unknown): error is CameraPermissionDeniedError {
  return error instanceof CameraPermissionDeniedError;
}

async function getCameraCanAskAgain(): Promise<boolean> {
  return true;
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
  const destination = buildPhotoStorageUri(fileName);

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
  if (!(await getTrailbookPermissionStatus()).mediaLibraryGranted) {
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
  if (!(await getTrailbookPermissionStatus()).mediaLibraryGranted) {
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
  if (!(await getTrailbookPermissionStatus()).cameraGranted) {
    throw new CameraPermissionDeniedError(await getCameraCanAskAgain());
  }

  try {
    console.warn("[Trailbook][camera] launching camera");
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || result.assets.length === 0) {
      console.warn("[Trailbook][camera] capture canceled");
      return null;
    }

    console.warn("[Trailbook][camera] capture received", { assets: result.assets.length });
    return normalizePhotoAsset(result.assets[0]);
  } catch (error) {
    console.warn("[Trailbook][photo-picker] Camera capture failed", error);
    return null;
  }
}

export async function downloadPhotoToLocalStorage(input: {
  fileNameSeed: string;
  mimeType: string | null;
  sourceUrl: string;
}): Promise<PickedPhoto> {
  await ensurePhotoStorageDirectory();

  const safeFileNameSeed = input.fileNameSeed.replace(/[^a-zA-Z0-9_-]/g, "-");
  const destination = buildPhotoStorageUri(`${safeFileNameSeed}${resolvePhotoExtensionFromMimeType(input.mimeType)}`);
  const result = await FileSystem.downloadAsync(input.sourceUrl, destination);
  const fileInfo = await FileSystem.getInfoAsync(result.uri);

  return {
    localUri: result.uri,
    mimeType: input.mimeType,
    fileSize: fileInfo.exists && !fileInfo.isDirectory ? fileInfo.size : null,
  };
}
