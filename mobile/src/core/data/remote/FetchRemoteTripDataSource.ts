import type { TripBundle } from '@/core/domain/model/tripBundle';
import type { Result } from '@/core/common/result';
import { err } from '@/core/common/result';
import { apiPostGzip, apiGet, apiDelete, apiPost } from './apiClient';
import { tripBundleToDto, tripBundleDtoToDomain, type TripListItemDto, type TripBundleRequestDto } from './dto/tripBundleDto';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';

export interface RemoteTripDataSource {
  uploadTrip(bundle: TripBundle): Promise<Result<void>>;
  fetchTripList(): Promise<Result<TripListItemDto[]>>;
  fetchTrip(clientTripId: string): Promise<Result<TripBundle>>;
  createShareLink(clientTripId: string): Promise<Result<{ shareUrl: string; pin: string }>>;
  deleteTrip(clientTripId: string): Promise<Result<void>>;
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
    if (!ownerUserId) return err('No authenticated local user');
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

  async deleteTrip(clientTripId: string): Promise<Result<void>> {
    return apiDelete<void>(`/trips/${clientTripId}`);
  }
}

export const remoteTripDataSource: RemoteTripDataSource = new FetchRemoteTripDataSource();
