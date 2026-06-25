import type { TripBundle } from '@/core/domain/model/tripBundle';
import type { Result } from '@/core/common/result';
import { err } from '@/core/common/result';
import { apiPost, apiGet, apiDelete } from './apiClient';
import { tripBundleToDto, tripBundleDtoToDomain, type TripListItemDto, type TripBundleRequestDto } from './dto/tripBundleDto';

export interface RemoteTripDataSource {
  uploadTrip(bundle: TripBundle): Promise<Result<void>>;
  fetchTripList(): Promise<Result<TripListItemDto[]>>;
  fetchTrip(clientTripId: string): Promise<Result<TripBundle>>;
  deleteTrip(clientTripId: string): Promise<Result<void>>;
}

class FetchRemoteTripDataSource implements RemoteTripDataSource {
  async uploadTrip(bundle: TripBundle): Promise<Result<void>> {
    return apiPost<void>('/trips', tripBundleToDto(bundle));
  }

  async fetchTripList(): Promise<Result<TripListItemDto[]>> {
    return apiGet<TripListItemDto[]>('/trips');
  }

  async fetchTrip(clientTripId: string): Promise<Result<TripBundle>> {
    const result = await apiGet<TripBundleRequestDto>(`/trips/${clientTripId}`);
    if (!result.ok) return err(result.error);
    return { ok: true, value: tripBundleDtoToDomain(result.value, 0) };
  }

  async deleteTrip(clientTripId: string): Promise<Result<void>> {
    return apiDelete<void>(`/trips/${clientTripId}`);
  }
}

export const remoteTripDataSource: RemoteTripDataSource = new FetchRemoteTripDataSource();
