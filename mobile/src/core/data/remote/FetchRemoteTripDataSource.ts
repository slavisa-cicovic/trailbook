import type { TripBundle } from '@/core/domain/model/tripBundle';
import type { Result } from '@/core/common/result';
import { err } from '@/core/common/result';
import { apiPostGzip, apiGet, apiDelete, apiPost } from './apiClient';
import { tripBundleToDto, tripBundleDtoToDomain, type TripListItemDto, type TripBundleRequestDto } from './dto/tripBundleDto';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { SESSION_EXPIRED_MESSAGE } from './apiError';

export interface RemoteTripDataSource {
  uploadTrip(bundle: TripBundle): Promise<Result<void>>;
  fetchTripList(): Promise<Result<TripListItemDto[]>>;
  fetchTrip(clientTripId: string): Promise<Result<TripBundle>>;
  createShareLink(clientTripId: string): Promise<Result<{ shareUrl: string; pin: string }>>;
  shareWithUser(clientTripId: string, email: string): Promise<Result<{ recipientEmail: string }>>;
  fetchSharedWithMe(): Promise<Result<SharedTripListItemDto[]>>;
  fetchSharedWithMeDetail(clientTripId: string): Promise<Result<SharedTripDetailDto>>;
  deleteTrip(clientTripId: string): Promise<Result<void>>;
}

export interface SharedTripListItemDto {
  clientTripId: string;
  title: string;
  description: string | null;
  startedAt: string;
  endedAt: string | null;
  owner: {
    displayName: string;
    email: string;
  };
  waypointCount: number;
  photoCount: number;
  distanceM: number;
}

export interface SharedTripDetailDto {
  bundle: TripBundleRequestDto;
  imagesByWaypointId: Record<
    string,
    Array<{
      capturedAt: string | null;
      getUrl: string;
      imageId: string;
      objectKey: string;
      photoLatitude: number | null;
      photoLongitude: number | null;
    }>
  >;
  owner: {
    displayName: string;
    email: string;
  };
}

class FetchRemoteTripDataSource implements RemoteTripDataSource {
  async uploadTrip(bundle: TripBundle): Promise<Result<void>> {
    return apiPostGzip<void>('/trips', tripBundleToDto(bundle));
  }

  async fetchTripList(): Promise<Result<TripListItemDto[]>> {
    return apiGet<TripListItemDto[]>('/trips');
  }

  async fetchTrip(clientTripId: string): Promise<Result<TripBundle>> {
    const result = await apiGet<TripBundleRequestDto>(`/trips/${clientTripId}`);
    if (!result.ok) return err(result.error);
    const ownerUserId = await authRepository.getLocalUserId();
    if (!ownerUserId) return err(SESSION_EXPIRED_MESSAGE);
    return { ok: true, value: tripBundleDtoToDomain(result.value, 0, ownerUserId) };
  }

  async createShareLink(clientTripId: string): Promise<Result<{ shareUrl: string; pin: string }>> {
    const result = await apiPost<{ shareUrl: string; pin: string }>(
      `/trips/${clientTripId}/share`,
      {},
    );
    if (!result.ok) return err(result.error);
    return { ok: true, value: result.value };
  }

  async shareWithUser(clientTripId: string, email: string): Promise<Result<{ recipientEmail: string }>> {
    return apiPost<{ recipientEmail: string }>(`/trips/${clientTripId}/share/users`, { email });
  }

  async fetchSharedWithMe(): Promise<Result<SharedTripListItemDto[]>> {
    return apiGet<SharedTripListItemDto[]>('/trips/shared-with-me');
  }

  async fetchSharedWithMeDetail(clientTripId: string): Promise<Result<SharedTripDetailDto>> {
    return apiGet<SharedTripDetailDto>(`/trips/shared-with-me/${clientTripId}`);
  }

  async deleteTrip(clientTripId: string): Promise<Result<void>> {
    return apiDelete<void>(`/trips/${clientTripId}`);
  }
}

export const remoteTripDataSource: RemoteTripDataSource = new FetchRemoteTripDataSource();
