import { MaterialIcons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

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
const PREVIEW_MAP_MARGIN = 12;
const PREVIEW_STEM_SIZE = 16;
const PREVIEW_MARKER_GAP = 12;
const MAX_RENDERED_ROUTE_COORDINATES = 3000;

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(value, maxValue));
}

function downsampleCoordinates<T>(coordinates: T[], maxCount: number): T[] {
  if (coordinates.length <= maxCount || maxCount < 2) {
    return coordinates;
  }

  const step = (coordinates.length - 1) / (maxCount - 1);

  return Array.from({ length: maxCount }, (_, index) => {
    const sourceIndex = index === maxCount - 1 ? coordinates.length - 1 : Math.floor(index * step);

    return coordinates[sourceIndex];
  });
}

export default function TripRouteMap({
  coordinates,
  mapType,
  onSelectWaypoint,
  region,
  segmentPolylines,
  waypointMarkers,
}: TripRouteMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [preview, setPreview] = useState<{
    waypointId: string;
    x: number;
    y: number;
  } | null>(null);
  const [mapLayout, setMapLayout] = useState({ width: 0, height: 0 });
  const [mapReady, setMapReady] = useState(false);
  const previewMarker = waypointMarkers.find(
    (waypointMarker) => waypointMarker.waypoint.localId === preview?.waypointId,
  );
  const previewPlacement = useMemo(() => {
    if (!preview || mapLayout.width <= 0 || mapLayout.height <= 0) {
      return null;
    }

    const maxLeft = Math.max(PREVIEW_MAP_MARGIN, mapLayout.width - PREVIEW_CARD_WIDTH - PREVIEW_MAP_MARGIN);
    const maxTop = Math.max(PREVIEW_MAP_MARGIN, mapLayout.height - PREVIEW_CARD_HEIGHT - PREVIEW_MAP_MARGIN);
    const left = clamp(preview.x - PREVIEW_CARD_WIDTH / 2, PREVIEW_MAP_MARGIN, maxLeft);
    const hasSpaceAbove = preview.y >= PREVIEW_CARD_HEIGHT + PREVIEW_STEM_SIZE + PREVIEW_MARKER_GAP;
    const preferredTop = hasSpaceAbove
      ? preview.y - PREVIEW_CARD_HEIGHT - PREVIEW_STEM_SIZE / 2 - PREVIEW_MARKER_GAP
      : preview.y + PREVIEW_STEM_SIZE / 2 + PREVIEW_MARKER_GAP;
    const top = clamp(preferredTop, PREVIEW_MAP_MARGIN, maxTop);
    const stemLeft = clamp(
      preview.x - left - PREVIEW_STEM_SIZE / 2,
      PREVIEW_STEM_SIZE,
      PREVIEW_CARD_WIDTH - PREVIEW_STEM_SIZE * 2,
    );

    return {
      card: { left, top },
      stem: { left: stemLeft },
      stemPosition: hasSpaceAbove ? "bottom" : "top",
    };
  }, [mapLayout.height, mapLayout.width, preview]);
  const renderedCoordinates = useMemo(
    () => downsampleCoordinates(coordinates, MAX_RENDERED_ROUTE_COORDINATES),
    [coordinates],
  );
  const renderedSegmentPolylines = useMemo(() => {
    if (segmentPolylines.length === 0) {
      return [];
    }

    const maxCoordinatesPerSegment = Math.max(
      2,
      Math.ceil(MAX_RENDERED_ROUTE_COORDINATES / segmentPolylines.length),
    );

    return segmentPolylines.map((segmentPolyline) => ({
      ...segmentPolyline,
      coordinates: downsampleCoordinates(segmentPolyline.coordinates, maxCoordinatesPerSegment),
    }));
  }, [segmentPolylines]);

  function selectWaypoint(waypoint: Waypoint) {
    setPreview(null);
    onSelectWaypoint(waypoint);
  }

  async function showWaypointPreview(marker: RouteWaypointMarker) {
    let nextX = Math.round(mapLayout.width / 2);
    let nextY = Math.max(PREVIEW_CARD_HEIGHT + PREVIEW_MAP_MARGIN, Math.round(mapLayout.height / 2));

    try {
      const point = await mapRef.current?.pointForCoordinate({
        latitude: marker.waypoint.latitude,
        longitude: marker.waypoint.longitude,
      });

      if (point) {
        nextX = Math.round(point.x);
        nextY = Math.round(point.y);
      }
    } catch {
      // Keep the map-local fallback if native coordinate projection is unavailable.
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
    <View
      onLayout={(event) => {
        setMapLayout({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        });
      }}
      style={styles.mapCard}
    >
      <MapView
        initialRegion={region}
        loadingBackgroundColor="#dfe8db"
        loadingEnabled
        loadingIndicatorColor="#355035"
        mapType={mapType}
        moveOnMarkerPress={false}
        onMapReady={() => setMapReady(true)}
        ref={mapRef}
        style={styles.map}
      >
        {renderedSegmentPolylines.length > 0 ? (
          renderedSegmentPolylines.map((segmentPolyline) => (
            <Polyline
              key={segmentPolyline.segmentLocalId}
              coordinates={segmentPolyline.coordinates}
              lineCap="round"
              lineJoin="round"
              strokeColor={segmentPolyline.color}
              strokeWidth={4}
            />
          ))
        ) : renderedCoordinates.length > 1 ? (
          <Polyline
            coordinates={renderedCoordinates}
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
      {!mapReady ? (
        <View pointerEvents="none" style={styles.mapLoadingOverlay}>
          <ActivityIndicator color="#355035" />
          <Text style={styles.mapLoadingText}>Loading map</Text>
        </View>
      ) : null}
      {previewMarker?.firstPhotoUri && previewPlacement ? (
        <View pointerEvents="box-none" style={styles.previewRoot}>
          <Pressable onPress={() => setPreview(null)} style={styles.previewBackdrop} />
          <View
            style={[
              styles.previewCardWrap,
              previewPlacement.card,
            ]}
          >
            {previewPlacement.stemPosition === "top" ? (
              <View style={[styles.previewStem, styles.previewStemTop, previewPlacement.stem]} />
            ) : null}
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
            {previewPlacement.stemPosition === "bottom" ? (
              <View style={[styles.previewStem, styles.previewStemBottom, previewPlacement.stem]} />
            ) : null}
          </View>
        </View>
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
  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#dfe8db",
  },
  mapLoadingText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#355035",
    textTransform: "uppercase",
    letterSpacing: 0.6,
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
    position: "absolute",
    width: PREVIEW_CARD_WIDTH,
  },
  previewImage: {
    width: "100%",
    height: 88,
    backgroundColor: "#d7ddcf",
  },
  previewRoot: {
    ...StyleSheet.absoluteFillObject,
  },
  previewStem: {
    position: "absolute",
    width: PREVIEW_STEM_SIZE,
    height: PREVIEW_STEM_SIZE,
    backgroundColor: "#fffdf8",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ebe1cf",
  },
  previewStemBottom: {
    bottom: -PREVIEW_STEM_SIZE / 2,
    transform: [{ rotate: "45deg" }],
  },
  previewStemTop: {
    top: -PREVIEW_STEM_SIZE / 2,
    transform: [{ rotate: "225deg" }],
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
