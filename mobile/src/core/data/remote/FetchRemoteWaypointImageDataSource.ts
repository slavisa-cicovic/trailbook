import * as FileSystem from 'expo-file-system/legacy';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { apiPost, apiGet } from './apiClient';

interface UploadUrlResponse {
  putUrl: string;
  objectKey: string;
}

interface ImageMetaDto {
  imageId: string;
  getUrl: string;
  objectKey: string;
}

export interface RemoteWaypointImageDataSource {
  requestUploadUrl(waypointId: string, imageId: string): Promise<Result<{ putUrl: string; objectKey: string }>>;
  uploadToStorage(putUrl: string, localUri: string): Promise<Result<void>>;
  getImages(waypointId: string): Promise<Result<ImageMetaDto[]>>;
  downloadImage(getUrl: string): Promise<Result<Uint8Array>>;
}

class FetchRemoteWaypointImageDataSource implements RemoteWaypointImageDataSource {
  async requestUploadUrl(waypointId: string, imageId: string): Promise<Result<{ putUrl: string; objectKey: string }>> {
    return apiPost<UploadUrlResponse>(`/waypoints/${waypointId}/images`, { imageId });
  }

  async uploadToStorage(putUrl: string, localUri: string): Promise<Result<void>> {
    try {
      const result = await FileSystem.uploadAsync(putUrl, localUri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });
      if (result.status < 200 || result.status >= 300) {
        return err(`S3 PUT failed: HTTP ${result.status}`);
      }
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  async getImages(waypointId: string): Promise<Result<ImageMetaDto[]>> {
    return apiGet<ImageMetaDto[]>(`/waypoints/${waypointId}/images`);
  }

  async downloadImage(getUrl: string): Promise<Result<Uint8Array>> {
    try {
      const res = await fetch(getUrl);
      if (!res.ok) return err(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      return ok(new Uint8Array(ab));
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }
}

export const remoteWaypointImageDataSource: RemoteWaypointImageDataSource =
  new FetchRemoteWaypointImageDataSource();
