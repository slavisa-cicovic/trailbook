import type { RawLocationSample, RawActivitySample, RawDeviceSample, RawSessionEvent } from '../model/rawSamples';
import type { CaptureMeta, TripBundle } from '../model/tripBundle';
import type { Result } from '@/core/common/result';

export interface RawCaptureRepository {
  initCaptureMeta(meta: CaptureMeta): Promise<Result<void>>;
  insertLocation(sample: RawLocationSample): Promise<Result<void>>;
  insertActivity(sample: RawActivitySample): Promise<Result<void>>;
  insertDeviceState(sample: RawDeviceSample): Promise<Result<void>>;
  insertSessionEvent(event: RawSessionEvent): Promise<Result<void>>;
  getTripBundle(clientTripId: string): Promise<Result<TripBundle | null>>;
  replaceTripBundle(bundle: TripBundle): Promise<Result<void>>;
  deleteAllRawData(): Promise<Result<void>>;
}
