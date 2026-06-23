export type TripStatus = 'RECORDING' | 'PAUSED' | 'COMPLETED';
export type SyncState = 'PENDING' | 'SYNCED' | 'FAILED';

export interface Trip {
  id: number;
  clientTripId: string;
  title: string;
  description: string | null;
  startedAt: Date;
  endedAt: Date | null;
  status: TripStatus;
  processingVersion: number;
  syncState: SyncState;
}
