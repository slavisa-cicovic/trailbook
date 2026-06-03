import type { PickedPhoto } from "../services/media/photo-picker.service";
import { downloadPhotoToLocalStorage } from "../services/media/photo-picker.service";

export interface DownloadWaypointPhotoInput {
  fileNameSeed: string;
  mimeType: string | null;
  sourceUrl: string;
}

export async function downloadWaypointPhoto(input: DownloadWaypointPhotoInput): Promise<PickedPhoto> {
  return downloadPhotoToLocalStorage(input);
}
