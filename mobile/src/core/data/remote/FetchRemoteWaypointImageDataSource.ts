import * as FileSystem from 'expo-file-system/legacy';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { apiDelete, apiPost, apiGet, fetchWithTimeout } from './apiClient';

interface UploadUrlResponse {
  putUrl: string;
  objectKey: string;
}

interface CompleteUploadResponse {
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
  completeUpload(waypointId: string, imageId: string): Promise<Result<{ objectKey: string }>>;
  getImages(waypointId: string): Promise<Result<ImageMetaDto[]>>;
  downloadImage(getUrl: string): Promise<Result<Uint8Array>>;
  deleteImage(waypointId: string, imageId: string): Promise<Result<void>>;
}

class FetchRemoteWaypointImageDataSource implements RemoteWaypointImageDataSource {
  async requestUploadUrl(waypointId: string, imageId: string): Promise<Result<{ putUrl: string; objectKey: string }>> {
    return apiPost<UploadUrlResponse>(`/waypoints/${waypointId}/images`, { imageId });
  }

  async uploadToStorage(putUrl: string, localUri: string): Promise<Result<void>> {
    try {
      const result = await FileSystem.uploadAsync(putUrl, localUri, {
        headers: { 'Content-Type': 'image/jpeg' },
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

  async completeUpload(
    waypointId: string,
    imageId: string,
  ): Promise<Result<{ objectKey: string }>> {
    return apiPost<CompleteUploadResponse>(
      `/waypoints/${waypointId}/images/${imageId}/complete`,
      {},
    );
  }

  async getImages(waypointId: string): Promise<Result<ImageMetaDto[]>> {
    return apiGet<ImageMetaDto[]>(`/waypoints/${waypointId}/images`);
  }

  async downloadImage(getUrl: string): Promise<Result<Uint8Array>> {
    try {
      const res = await fetchWithTimeout(getUrl);
      if (!res.ok) return err(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      return ok(new Uint8Array(ab));
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  async deleteImage(waypointId: string, imageId: string): Promise<Result<void>> {
    return apiDelete<void>(`/waypoints/${waypointId}/images/${imageId}`);
  }
}

export const remoteWaypointImageDataSource: RemoteWaypointImageDataSource =
  new FetchRemoteWaypointImageDataSource();
