import type { Segment } from './segment';

export interface ReprocessingSnapshot {
  tripId: string;
  processingVersion: number;
  segments: Segment[];
  createdAt: Date;
}
