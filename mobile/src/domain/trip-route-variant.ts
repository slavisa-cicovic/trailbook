export type TripRouteVariantType = "raw" | "matched";
export type TripRouteVariantProvider = "trailbook" | "valhalla" | "graphhopper" | "manual";

export interface TripRouteVariant {
  createdAt: string;
  deletedAt: string | null;
  geometry: Array<{
    latitude: number;
    longitude: number;
  }>;
  localId: string;
  provider: TripRouteVariantProvider;
  serverId: string | null;
  tripLocalId: string;
  updatedAt: string;
  variantType: TripRouteVariantType;
}
