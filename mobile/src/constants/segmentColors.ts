import type { SegmentType } from '@/core/domain/model/segment';

export const SEGMENT_COLOR: Record<SegmentType, string> = {
  WALK:       '#4caf50',
  BIKE:       '#2196f3',
  DRIVE:      '#ff9800',
  BOAT:       '#009688',
  PLANE:      '#9c27b0',
  STATIONARY: '#9e9e9e',
  UNKNOWN:    '#e0e0e0',
};

export const SEGMENT_LABEL: Record<SegmentType, string> = {
  WALK: 'Walk', BIKE: 'Bike', DRIVE: 'Drive',
  BOAT: 'Boat', PLANE: 'Plane', STATIONARY: 'Stationary', UNKNOWN: 'Unknown',
};
