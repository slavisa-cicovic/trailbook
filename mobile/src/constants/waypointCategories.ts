import type { WaypointCategory } from '@/core/domain/model/waypoint';
import type { MaterialIcons } from '@expo/vector-icons';

export const CATEGORY_LABEL: Record<WaypointCategory, string> = {
  GENERIC:    'Note',
  DEPARTURE:  'Departure',
  FUEL:       'Fuel',
  BORDER:     'Border',
  PORT:       'Port',
  FERRY:      'Ferry',
  RESTAURANT: 'Restaurant',
  CAFE:       'Cafe',
  VIEWPOINT:  'Viewpoint',
  MONUMENT:   'Monument',
  BEACH:      'Beach',
};

export const CATEGORY_ICON: Record<WaypointCategory, keyof typeof MaterialIcons.glyphMap> = {
  GENERIC:    'place',
  DEPARTURE:  'flag',
  FUEL:       'local-gas-station',
  BORDER:     'policy',
  PORT:       'anchor',
  FERRY:      'directions-boat',
  RESTAURANT: 'restaurant',
  CAFE:       'local-cafe',
  VIEWPOINT:  'landscape',
  MONUMENT:   'account-balance',
  BEACH:      'beach-access',
};

export const CATEGORY_ORDER: WaypointCategory[] = [
  'GENERIC', 'DEPARTURE', 'FUEL', 'BORDER', 'PORT',
  'FERRY', 'RESTAURANT', 'CAFE', 'VIEWPOINT', 'MONUMENT', 'BEACH',
];
