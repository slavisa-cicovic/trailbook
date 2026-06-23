export type SegmentType =
  | 'WALK'
  | 'BIKE'
  | 'DRIVE'
  | 'BOAT'
  | 'PLANE'
  | 'STATIONARY'
  | 'UNKNOWN';

export interface Segment {
  tripId: string;
  index: number;
  segmentType: SegmentType;
  startedAt: Date;
  endedAt: Date;
  distanceM: number | null;
}
