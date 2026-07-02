import type { Result } from '@/core/common/result';
import { apiGet, apiPost } from './apiClient';
import type {
  TripGroupsListResponseDto,
  TripGroupsSyncRequestDto,
  TripGroupsSyncResponseDto,
} from './dto/tripGroupDto';

export interface RemoteTripGroupDataSource {
  fetchGroups(): Promise<Result<TripGroupsListResponseDto>>;
  syncGroups(request: TripGroupsSyncRequestDto): Promise<Result<TripGroupsSyncResponseDto>>;
}

class FetchRemoteTripGroupDataSource implements RemoteTripGroupDataSource {
  fetchGroups(): Promise<Result<TripGroupsListResponseDto>> {
    return apiGet<TripGroupsListResponseDto>('/trip-groups');
  }

  syncGroups(request: TripGroupsSyncRequestDto): Promise<Result<TripGroupsSyncResponseDto>> {
    return apiPost<TripGroupsSyncResponseDto>('/trip-groups/sync', request);
  }
}

export const remoteTripGroupDataSource: RemoteTripGroupDataSource = new FetchRemoteTripGroupDataSource();
