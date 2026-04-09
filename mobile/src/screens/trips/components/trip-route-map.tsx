import { MaterialIcons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { StyleSheet, View } from "react-native";

import { getWaypointCategoryOption } from "../../../constants/waypoint-categories";
import type { Waypoint } from "../../../domain/trips";

export type TrailbookMapType = "standard" | "satellite" | "hybrid";

interface RouteWaypointMarker {
  hasPhotos: boolean;
  waypoint: Waypoint;
}

interface TripRouteMapProps {
  coordinates: Array<{ latitude: number; longitude: number }>;
  mapType: TrailbookMapType;
  onSelectWaypoint: (waypoint: Waypoint) => void;
  region: Region | null;
  segmentPolylines: Array<{
    color: string;
    coordinates: Array<{ latitude: number; longitude: number }>;
    segmentLocalId: string;
  }>;
  waypointMarkers: RouteWaypointMarker[];
}

export default function TripRouteMap({
  coordinates,
  mapType,
  onSelectWaypoint,
  region,
  segmentPolylines,
  waypointMarkers,
}: TripRouteMapProps) {
  if (!region) {
    return <View style={styles.emptyMap} />;
  }

  return (
    <View style={styles.mapCard}>
      <MapView initialRegion={region} mapType={mapType} style={styles.map}>
        {segmentPolylines.length > 0 ? (
          segmentPolylines.map((segmentPolyline) => (
            <Polyline
              key={segmentPolyline.segmentLocalId}
              coordinates={segmentPolyline.coordinates}
              lineCap="round"
              lineJoin="round"
              strokeColor={segmentPolyline.color}
              strokeWidth={4}
            />
          ))
        ) : coordinates.length > 1 ? (
          <Polyline
            coordinates={coordinates}
            lineCap="round"
            lineJoin="round"
            strokeColor="#355035"
            strokeWidth={4}
          />
        ) : null}
        {waypointMarkers.map(({ hasPhotos, waypoint }) => (
          <Marker
            key={waypoint.localId}
            coordinate={{
              latitude: waypoint.latitude,
              longitude: waypoint.longitude,
            }}
            onPress={() => onSelectWaypoint(waypoint)}
          >
            <View
              style={[
                styles.markerBadge,
                { backgroundColor: hasPhotos ? "#9f5f0f" : getWaypointCategoryOption(waypoint.category).color },
              ]}
            >
              <MaterialIcons
                color="#fffdf8"
                name={getWaypointCategoryOption(waypoint.category).iconName}
                size={18}
              />
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  mapCard: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#dfe8db",
    minHeight: 320,
  },
  map: {
    flex: 1,
  },
  emptyMap: {
    flex: 1,
    minHeight: 320,
    borderRadius: 20,
    backgroundColor: "#dfe8db",
  },
  markerBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fffdf8",
  },
});
