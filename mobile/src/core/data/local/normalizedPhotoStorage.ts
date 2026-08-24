import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

const JPEG_QUALITY = 0.85;

export async function saveNormalizedJpeg(sourceUri: string, destinationUri: string): Promise<void> {
  const normalized = await ImageManipulator.manipulateAsync(sourceUri, [], {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  try {
    await FileSystem.copyAsync({ from: normalized.uri, to: destinationUri });
  } finally {
    if (normalized.uri !== sourceUri && normalized.uri !== destinationUri) {
      await FileSystem.deleteAsync(normalized.uri, { idempotent: true }).catch(() => undefined);
    }
  }
}
