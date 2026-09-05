export type WaypointCategory =
  | 'GENERIC'
  | 'DEPARTURE'
  | 'FUEL'
  | 'BORDER'
  | 'PORT'
  | 'FERRY'
  | 'RESTAURANT'
  | 'CAFE'
  | 'VIEWPOINT'
  | 'MONUMENT'
  | 'BEACH';

export type ImageSource = 'CAMERA' | 'GALLERY';
export type ImageUploadState = 'PENDING' | 'UPLOADED' | 'FAILED';

export interface Waypoint {
  id: string;
  tripId: string;
  title: string;
  description: string | null;
  category: WaypointCategory;
  latitude: number;
  longitude: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WaypointImage {
  id: string;
  waypointId: string;
  source: ImageSource;
  localUri: string;
  capturedAt: Date | null;
  photoLatitude: number | null;
  photoLongitude: number | null;
  locationMatchesWaypoint: boolean;
  objectKey: string | null;
  uploadState: ImageUploadState;
}
