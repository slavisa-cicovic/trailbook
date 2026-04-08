import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { StyleSheet, View } from "react-native";

import type { Waypoint } from "../../../domain/trips";

interface RouteWaypointMarker {
  hasPhotos: boolean;
  waypoint: Waypoint;
}

interface TripRouteMapProps {
  coordinates: Array<{ latitude: number; longitude: number }>;
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
      <MapView initialRegion={region} style={styles.map}>
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
            pinColor={hasPhotos ? "#9f5f0f" : "#355035"}
          />
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
});
