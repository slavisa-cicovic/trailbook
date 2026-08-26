import * as FileSystem from 'expo-file-system/legacy';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { apiDelete, apiPost, apiGet, fetchWithTimeout } from './apiClient';
import { apiNetworkErrorMessage, SERVER_ERROR_MESSAGE } from './apiError';

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
  requestUploadUrl(
    waypointId: string,
    imageId: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<Result<{ putUrl: string; objectKey: string }>>;
  uploadToStorage(putUrl: string, localUri: string, contentType: string): Promise<Result<void>>;
  completeUpload(
    waypointId: string,
    imageId: string,
    storageKey: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<Result<{ objectKey: string }>>;
  getImages(waypointId: string): Promise<Result<ImageMetaDto[]>>;
  downloadImage(getUrl: string): Promise<Result<Uint8Array>>;
  deleteImage(waypointId: string, imageId: string): Promise<Result<void>>;
}

class FetchRemoteWaypointImageDataSource implements RemoteWaypointImageDataSource {
  async requestUploadUrl(
    waypointId: string,
    imageId: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<Result<{ putUrl: string; objectKey: string }>> {
    return apiPost<UploadUrlResponse>(`/waypoints/${waypointId}/images`, {
      contentType,
      imageId,
      sizeBytes,
    });
  }

  async uploadToStorage(putUrl: string, localUri: string, contentType: string): Promise<Result<void>> {
    try {
      const result = await FileSystem.uploadAsync(putUrl, localUri, {
        headers: { 'Content-Type': contentType },
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      });
      if (result.status < 200 || result.status >= 300) {
        return err(SERVER_ERROR_MESSAGE);
      }
      return ok(undefined);
    } catch {
      return err(apiNetworkErrorMessage());
    }
  }

  async completeUpload(
    waypointId: string,
    imageId: string,
    storageKey: string,
    contentType: string,
    sizeBytes: number,
  ): Promise<Result<{ objectKey: string }>> {
    return apiPost<CompleteUploadResponse>(
      `/waypoints/${waypointId}/images/${imageId}/complete`,
      { contentType, sizeBytes, storageKey },
    );
  }

  async getImages(waypointId: string): Promise<Result<ImageMetaDto[]>> {
    return apiGet<ImageMetaDto[]>(`/waypoints/${waypointId}/images`);
  }

  async downloadImage(getUrl: string): Promise<Result<Uint8Array>> {
    try {
      const res = await fetchWithTimeout(getUrl);
      if (!res.ok) return err(SERVER_ERROR_MESSAGE);
      const ab = await res.arrayBuffer();
      return ok(new Uint8Array(ab));
    } catch {
      return err(apiNetworkErrorMessage());
    }
  }

  async deleteImage(waypointId: string, imageId: string): Promise<Result<void>> {
    return apiDelete<void>(`/waypoints/${waypointId}/images/${imageId}`);
  }
}

export const remoteWaypointImageDataSource: RemoteWaypointImageDataSource =
  new FetchRemoteWaypointImageDataSource();
