import { MaterialIcons } from "@expo/vector-icons";
import { useMemo, useRef, useState } from "react";
import MapView, { Marker, Polyline, type LongPressEvent, type Region } from "react-native-maps";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { getRecordingProfileColor, getRecordingProfileLabel } from "../../../constants/recording-profiles";
import { getWaypointCategoryOption } from "../../../constants/waypoint-categories";
import type { RecordingProfile, Waypoint } from "../../../domain/trips";

export type TrailbookMapType = "standard" | "satellite" | "hybrid";

interface RouteWaypointMarker {
  firstPhotoUri?: string | null;
  hasPhotos: boolean;
  waypoint: Waypoint;
}

export interface RoutePointInfo {
  accuracy: number | null;
  latitude: number;
  localId: string;
  longitude: number;
  recordedAt: string;
  recordingProfile: RecordingProfile;
  speed: number | null;
}

interface TripRouteMapProps {
  coordinates: { latitude: number; longitude: number }[];
  mapType: TrailbookMapType;
  onSelectWaypoint: (waypoint: Waypoint) => void;
  region: Region | null;
  routePointInfos?: RoutePointInfo[];
  segmentPolylines: {
    color: string;
    coordinates: { latitude: number; longitude: number }[];
    segmentLocalId: string;
  }[];
  waypointMarkers: RouteWaypointMarker[];
}

const PREVIEW_CARD_WIDTH = 147;
const PREVIEW_CARD_HEIGHT = 105;
const PREVIEW_MAP_MARGIN = 12;
const PREVIEW_STEM_SIZE = 16;
const PREVIEW_MARKER_GAP = 12;
const MAX_RENDERED_ROUTE_COORDINATES = 3000;
const ROUTE_POINT_PREVIEW_CARD_WIDTH = 186;
const ROUTE_POINT_PREVIEW_CARD_HEIGHT = 104;
const ROUTE_POINT_PREVIEW_MIN_DISTANCE_METERS = 120;
const ROUTE_POINT_PREVIEW_MAX_DISTANCE_METERS = 50_000;
const ROUTE_POINT_PREVIEW_TOUCH_RADIUS_PX = 32;
const METERS_PER_DEGREE_LATITUDE = 111_320;

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

function getMetersPerDegreeLongitude(latitude: number): number {
  return METERS_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
}

function getLocalMeters(
  coordinate: { latitude: number; longitude: number },
  origin: { latitude: number; longitude: number },
): { x: number; y: number } {
  return {
    x: (coordinate.longitude - origin.longitude) * getMetersPerDegreeLongitude(origin.latitude),
    y: (coordinate.latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE,
  };
}

function getDistanceToSegmentMeters(
  target: { latitude: number; longitude: number },
  start: RoutePointInfo,
  end: RoutePointInfo,
): { distanceMeters: number; nearestPoint: RoutePointInfo } {
  const startMeters = getLocalMeters(start, target);
  const endMeters = getLocalMeters(end, target);
  const dx = endMeters.x - startMeters.x;
  const dy = endMeters.y - startMeters.y;
  const segmentLengthSquared = dx * dx + dy * dy;

  if (segmentLengthSquared === 0) {
    return {
      distanceMeters: Math.hypot(startMeters.x, startMeters.y),
      nearestPoint: start,
    };
  }

  const t = clamp(-(startMeters.x * dx + startMeters.y * dy) / segmentLengthSquared, 0, 1);
  const projection = {
    x: startMeters.x + t * dx,
    y: startMeters.y + t * dy,
  };

  return {
    distanceMeters: Math.hypot(projection.x, projection.y),
    nearestPoint: t < 0.5 ? start : end,
  };
}

function findNearestRoutePoint(
  target: { latitude: number; longitude: number },
  routePointInfos: RoutePointInfo[],
  maxDistanceMeters: number,
): RoutePointInfo | null {
  if (routePointInfos.length === 0) {
    return null;
  }

  if (routePointInfos.length === 1) {
    const pointMeters = getLocalMeters(routePointInfos[0], target);
    const distanceMeters = Math.hypot(pointMeters.x, pointMeters.y);

    return distanceMeters <= maxDistanceMeters ? routePointInfos[0] : null;
  }

  let best: { distanceMeters: number; nearestPoint: RoutePointInfo } | null = null;

  for (let index = 0; index < routePointInfos.length - 1; index += 1) {
    const candidate = getDistanceToSegmentMeters(target, routePointInfos[index], routePointInfos[index + 1]);

    if (!best || candidate.distanceMeters < best.distanceMeters) {
      best = candidate;
    }
  }

  return best && best.distanceMeters <= maxDistanceMeters ? best.nearestPoint : null;
}

function getRoutePointPreviewMaxDistanceMeters(
  region: Region | null,
  mapLayout: { width: number; height: number },
): number {
  if (!region || mapLayout.width <= 0 || mapLayout.height <= 0) {
    return ROUTE_POINT_PREVIEW_MIN_DISTANCE_METERS;
  }

  const horizontalMeters = region.longitudeDelta * getMetersPerDegreeLongitude(region.latitude);
  const verticalMeters = region.latitudeDelta * METERS_PER_DEGREE_LATITUDE;
  const metersPerPixel = Math.max(horizontalMeters / mapLayout.width, verticalMeters / mapLayout.height);

  return clamp(
    metersPerPixel * ROUTE_POINT_PREVIEW_TOUCH_RADIUS_PX,
    ROUTE_POINT_PREVIEW_MIN_DISTANCE_METERS,
    ROUTE_POINT_PREVIEW_MAX_DISTANCE_METERS,
  );
}

function formatRecordedAt(recordedAt: string): string {
  const date = new Date(recordedAt);

  if (Number.isNaN(date.getTime())) {
    return recordedAt;
  }

  return date.toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}

function formatSpeed(speed: number | null): string | null {
  if (speed === null || speed < 0) {
    return null;
  }

  return `${Math.round(speed * 3.6)} km/h`;
}

function formatAccuracy(accuracy: number | null): string | null {
  if (accuracy === null) {
    return null;
  }

  return `±${Math.round(accuracy)} m`;
}

export default function TripRouteMap({
  coordinates,
  mapType,
  onSelectWaypoint,
  region,
  routePointInfos = [],
  segmentPolylines,
  waypointMarkers,
}: TripRouteMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [preview, setPreview] = useState<{
    waypointId: string;
    x: number;
    y: number;
  } | null>(null);
  const [routePointPreview, setRoutePointPreview] = useState<{
    point: RoutePointInfo;
    x: number;
    y: number;
  } | null>(null);
  const [mapLayout, setMapLayout] = useState({ width: 0, height: 0 });
  const [mapReady, setMapReady] = useState(false);
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
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
  const routePointPreviewPlacement = useMemo(() => {
    if (!routePointPreview || mapLayout.width <= 0 || mapLayout.height <= 0) {
      return null;
    }

    const maxLeft = Math.max(
      PREVIEW_MAP_MARGIN,
      mapLayout.width - ROUTE_POINT_PREVIEW_CARD_WIDTH - PREVIEW_MAP_MARGIN,
    );
    const maxTop = Math.max(
      PREVIEW_MAP_MARGIN,
      mapLayout.height - ROUTE_POINT_PREVIEW_CARD_HEIGHT - PREVIEW_MAP_MARGIN,
    );
    const left = clamp(routePointPreview.x - ROUTE_POINT_PREVIEW_CARD_WIDTH / 2, PREVIEW_MAP_MARGIN, maxLeft);
    const hasSpaceAbove =
      routePointPreview.y >= ROUTE_POINT_PREVIEW_CARD_HEIGHT + PREVIEW_STEM_SIZE + PREVIEW_MARKER_GAP;
    const preferredTop = hasSpaceAbove
      ? routePointPreview.y - ROUTE_POINT_PREVIEW_CARD_HEIGHT - PREVIEW_STEM_SIZE / 2 - PREVIEW_MARKER_GAP
      : routePointPreview.y + PREVIEW_STEM_SIZE / 2 + PREVIEW_MARKER_GAP;
    const top = clamp(preferredTop, PREVIEW_MAP_MARGIN, maxTop);
    const stemLeft = clamp(
      routePointPreview.x - left - PREVIEW_STEM_SIZE / 2,
      PREVIEW_STEM_SIZE,
      ROUTE_POINT_PREVIEW_CARD_WIDTH - PREVIEW_STEM_SIZE * 2,
    );

    return {
      card: { left, top },
      stem: { left: stemLeft },
      stemPosition: hasSpaceAbove ? "bottom" : "top",
    };
  }, [mapLayout.height, mapLayout.width, routePointPreview]);
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
  const routePointPreviewSpeed = routePointPreview ? formatSpeed(routePointPreview.point.speed) : null;
  const routePointPreviewAccuracy = routePointPreview ? formatAccuracy(routePointPreview.point.accuracy) : null;

  function selectWaypoint(waypoint: Waypoint) {
    setPreview(null);
    setRoutePointPreview(null);
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

    setRoutePointPreview(null);
    setPreview({
      waypointId: marker.waypoint.localId,
      x: nextX,
      y: nextY,
    });
  }

  async function showRoutePointPreview(event: LongPressEvent) {
    const maxDistanceMeters = getRoutePointPreviewMaxDistanceMeters(currentRegion ?? region, mapLayout);
    const nearestPoint = findNearestRoutePoint(
      event.nativeEvent.coordinate,
      routePointInfos,
      maxDistanceMeters,
    );

    if (!nearestPoint) {
      setRoutePointPreview(null);
      return;
    }

    let nextX = Math.round(event.nativeEvent.position.x);
    let nextY = Math.round(event.nativeEvent.position.y);

    try {
      const point = await mapRef.current?.pointForCoordinate({
        latitude: nearestPoint.latitude,
        longitude: nearestPoint.longitude,
      });

      if (point) {
        nextX = Math.round(point.x);
        nextY = Math.round(point.y);
      }
    } catch {
      // Keep the map event position if native coordinate projection is unavailable.
    }

    setPreview(null);
    setRoutePointPreview({
      point: nearestPoint,
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
        onLongPress={(event) => void showRoutePointPreview(event)}
        onMapReady={() => setMapReady(true)}
        onRegionChangeComplete={setCurrentRegion}
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
      {routePointPreview && routePointPreviewPlacement ? (
        <View pointerEvents="box-none" style={styles.previewRoot}>
          <Pressable onPress={() => setRoutePointPreview(null)} style={styles.previewBackdrop} />
          <View
            style={[
              styles.routePointPreviewCardWrap,
              routePointPreviewPlacement.card,
            ]}
          >
            {routePointPreviewPlacement.stemPosition === "top" ? (
              <View style={[styles.routePointPreviewStem, styles.previewStemTop, routePointPreviewPlacement.stem]} />
            ) : null}
            <View style={styles.routePointPreviewCard}>
              <View style={styles.routePointPreviewHeader}>
                <View
                  style={[
                    styles.routePointModeDot,
                    { backgroundColor: getRecordingProfileColor(routePointPreview.point.recordingProfile) },
                  ]}
                />
                <Text style={styles.routePointModeText}>
                  {getRecordingProfileLabel(routePointPreview.point.recordingProfile)}
                </Text>
              </View>
              <Text style={styles.routePointRecordedAt}>
                {formatRecordedAt(routePointPreview.point.recordedAt)}
              </Text>
              <View style={styles.routePointMetaRow}>
                {routePointPreviewSpeed ? (
                  <Text style={styles.routePointMetaPill}>{routePointPreviewSpeed}</Text>
                ) : null}
                {routePointPreviewAccuracy ? (
                  <Text style={styles.routePointMetaPill}>{routePointPreviewAccuracy}</Text>
                ) : null}
              </View>
            </View>
            {routePointPreviewPlacement.stemPosition === "bottom" ? (
              <View style={[styles.routePointPreviewStem, styles.previewStemBottom, routePointPreviewPlacement.stem]} />
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
  routePointMetaPill: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "700",
    color: "#243224",
  },
  routePointMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  routePointModeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routePointModeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#243224",
  },
  routePointPreviewCard: {
    minHeight: ROUTE_POINT_PREVIEW_CARD_HEIGHT,
    borderRadius: 14,
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    padding: 10,
    gap: 6,
    shadowColor: "#142014",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  routePointPreviewCardWrap: {
    position: "absolute",
    width: ROUTE_POINT_PREVIEW_CARD_WIDTH,
  },
  routePointPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  routePointPreviewStem: {
    position: "absolute",
    width: PREVIEW_STEM_SIZE,
    height: PREVIEW_STEM_SIZE,
    backgroundColor: "#fffdf8",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ebe1cf",
  },
  routePointRecordedAt: {
    fontSize: 11,
    fontWeight: "600",
    color: "#52624f",
  },
});
