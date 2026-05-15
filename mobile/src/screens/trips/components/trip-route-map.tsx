import { MaterialIcons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { Dimensions, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { getWaypointCategoryOption } from "../../../constants/waypoint-categories";
import type { Waypoint } from "../../../domain/trips";

export type TrailbookMapType = "standard" | "satellite" | "hybrid";

interface RouteWaypointMarker {
  firstPhotoUri?: string | null;
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

const PREVIEW_CARD_WIDTH = 147;
const PREVIEW_CARD_HEIGHT = 105;
const PREVIEW_SCREEN_MARGIN = 14;

export default function TripRouteMap({
  coordinates,
  mapType,
  onSelectWaypoint,
  region,
  segmentPolylines,
  waypointMarkers,
}: TripRouteMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const mapCardRef = useRef<View | null>(null);
  const [preview, setPreview] = useState<{
    waypointId: string;
    x: number;
    y: number;
  } | null>(null);
  const previewMarker = waypointMarkers.find(
    (waypointMarker) => waypointMarker.waypoint.localId === preview?.waypointId,
  );

  function selectWaypoint(waypoint: Waypoint) {
    setPreview(null);
    onSelectWaypoint(waypoint);
  }

  async function showWaypointPreview(marker: RouteWaypointMarker) {
    const screen = Dimensions.get("window");
    let nextX = Math.round(screen.width / 2);
    let nextY = 96;

    try {
      const point = await mapRef.current?.pointForCoordinate({
        latitude: marker.waypoint.latitude,
        longitude: marker.waypoint.longitude,
      });

      if (point) {
        await new Promise<void>((resolve) => {
          if (!mapCardRef.current) {
            resolve();
            return;
          }

          mapCardRef.current.measureInWindow((mapX, mapY) => {
            nextX = Math.round(mapX + point.x);
            nextY = Math.round(mapY + point.y);
            resolve();
          });
        });
      }
    } catch {
      // Keep the centered fallback if native coordinate projection is unavailable.
    }

    setPreview({
      waypointId: marker.waypoint.localId,
      x: nextX,
      y: nextY,
    });
  }

  if (!region) {
    return <View style={styles.emptyMap} />;
  }

  return (
    <View ref={mapCardRef} style={styles.mapCard}>
      <MapView initialRegion={region} mapType={mapType} ref={mapRef} style={styles.map}>
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
        {waypointMarkers.map((waypointMarker) => {
          const { firstPhotoUri, hasPhotos, waypoint } = waypointMarker;

          return (
            <Marker
              key={waypoint.localId}
              coordinate={{
                latitude: waypoint.latitude,
                longitude: waypoint.longitude,
              }}
              onPress={() => {
                if (!firstPhotoUri) {
                  selectWaypoint(waypoint);
                  return;
                }

                void showWaypointPreview(waypointMarker);
              }}
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
          );
        })}
      </MapView>
      {previewMarker?.firstPhotoUri ? (
        <Modal
          animationType="fade"
          onRequestClose={() => setPreview(null)}
          transparent
          visible
        >
          <View style={styles.previewRoot}>
            <Pressable onPress={() => setPreview(null)} style={styles.previewBackdrop} />
            <View
              style={[
                styles.previewCardWrap,
                {
                  left: Math.max(
                    PREVIEW_SCREEN_MARGIN,
                    Math.min(
                      (preview?.x ?? 0) - PREVIEW_CARD_WIDTH / 2,
                      Dimensions.get("window").width - PREVIEW_CARD_WIDTH - PREVIEW_SCREEN_MARGIN,
                    ),
                  ),
                  top: Math.max(
                    PREVIEW_SCREEN_MARGIN,
                    (preview?.y ?? 0) - PREVIEW_CARD_HEIGHT,
                  ),
                },
              ]}
            >
              <Pressable onPress={() => selectWaypoint(previewMarker.waypoint)} style={styles.previewCard}>
                <Image
                  resizeMode="cover"
                  source={{ uri: previewMarker.firstPhotoUri }}
                  style={styles.previewImage}
                />
                <View style={styles.previewTitleOverlay}>
                  <Text numberOfLines={1} style={styles.previewTitle}>
                    {previewMarker.waypoint.title}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.previewStem} />
            </View>
          </View>
        </Modal>
      ) : null}
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
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 28, 20, 0.16)",
  },
  previewCard: {
    width: PREVIEW_CARD_WIDTH,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#ebe1cf",
  },
  previewCardWrap: {
    alignItems: "center",
    position: "absolute",
  },
  previewImage: {
    width: "100%",
    height: 88,
    backgroundColor: "#d7ddcf",
  },
  previewRoot: {
    flex: 1,
  },
  previewStem: {
    width: 16,
    height: 16,
    marginTop: -8,
    backgroundColor: "#fffdf8",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ebe1cf",
    transform: [{ rotate: "45deg" }],
  },
  previewTitle: {
    fontSize: 12,
    fontWeight: "400",
    color: "#fffdf8",
  },
  previewTitleOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});
