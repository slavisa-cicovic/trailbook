import * as ImagePicker from "expo-image-picker";

export interface PickedPhoto {
  fileSize: number | null;
  localUri: string;
  mimeType: string | null;
}

function normalizePhotoAsset(asset: ImagePicker.ImagePickerAsset): PickedPhoto {
  return {
    localUri: asset.uri,
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

  return result.assets.map(normalizePhotoAsset);
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
