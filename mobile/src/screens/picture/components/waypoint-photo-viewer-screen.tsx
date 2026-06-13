import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import MapView, { Marker, Polyline } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { WaypointAttachment } from "../../../domain/trips";

interface WaypointPhotoViewerScreenProps {
  attachments: WaypointAttachment[];
  hasNextGroup?: boolean;
  hasPreviousGroup?: boolean;
  nextGroupTitle?: string | null;
  onBack: () => void;
  onScrollPastEnd?: () => void;
  onScrollPastStart?: () => void;
  onRemoveCurrent?: (attachmentLocalId: string) => void;
  previousGroupTitle?: string | null;
  readOnly?: boolean;
  routeCoordinates?: MapCoordinate[];
  selectedAttachmentId: string | null;
  tripTitle?: string;
  waypointCoordinate?: MapCoordinate | null;
  waypointTitle: string;
}

interface ZoomablePhotoProps {
  height: number;
  onZoomChange: (zoomed: boolean) => void;
  uri: string;
  width: number;
}

interface MapCoordinate {
  latitude: number;
  longitude: number;
}

const MAX_ZOOM_SCALE = 4;
const MIN_ZOOM_SCALE = 1;
const MAX_PREVIEW_ROUTE_POINTS = 240;
const ROUTE_PREVIEW_BASE_SIZE = 68;
const ROUTE_PREVIEW_MAX_ASPECT_RATIO = 1.85;
const ROUTE_PREVIEW_MIN_ASPECT_RATIO = 0.64;
const ROUTE_PREVIEW_LINE_COLOR = "#00D9FF";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildRoutePreviewRegion(
  coordinates: MapCoordinate[],
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null {
  if (coordinates.length === 0) {
    return null;
  }

  let minLatitude = coordinates[0].latitude;
  let maxLatitude = coordinates[0].latitude;
  let minLongitude = coordinates[0].longitude;
  let maxLongitude = coordinates[0].longitude;

  for (const coordinate of coordinates) {
    minLatitude = Math.min(minLatitude, coordinate.latitude);
    maxLatitude = Math.max(maxLatitude, coordinate.latitude);
    minLongitude = Math.min(minLongitude, coordinate.longitude);
    maxLongitude = Math.max(maxLongitude, coordinate.longitude);
  }

  const latitudeDelta = Math.max((maxLatitude - minLatitude) * 1.35, 0.004);
  const longitudeDelta = Math.max((maxLongitude - minLongitude) * 1.35, 0.004);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}

function downsampleRouteCoordinates(coordinates: MapCoordinate[]): MapCoordinate[] {
  if (coordinates.length <= MAX_PREVIEW_ROUTE_POINTS) {
    return coordinates;
  }

  const step = Math.ceil(coordinates.length / MAX_PREVIEW_ROUTE_POINTS);

  return coordinates.filter((_, index) => index % step === 0 || index === coordinates.length - 1);
}

function getRoutePreviewSize(region: NonNullable<ReturnType<typeof buildRoutePreviewRegion>>) {
  const rawAspectRatio = region.longitudeDelta / region.latitudeDelta;
  const aspectRatio = clamp(rawAspectRatio, ROUTE_PREVIEW_MIN_ASPECT_RATIO, ROUTE_PREVIEW_MAX_ASPECT_RATIO);

  if (aspectRatio >= 1) {
    return {
      width: ROUTE_PREVIEW_BASE_SIZE * aspectRatio,
      height: ROUTE_PREVIEW_BASE_SIZE,
    };
  }

  return {
    width: ROUTE_PREVIEW_BASE_SIZE,
    height: ROUTE_PREVIEW_BASE_SIZE / aspectRatio,
  };
}

function ZoomablePhoto({ height, onZoomChange, uri, width }: ZoomablePhotoProps) {
  const [baseScale, setBaseScale] = useState(1);
  const [pinchScale, setPinchScale] = useState(1);
  const [baseTranslate, setBaseTranslate] = useState({ x: 0, y: 0 });
  const [panTranslate, setPanTranslate] = useState({ x: 0, y: 0 });
  const currentScale = clamp(baseScale * pinchScale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
  const currentTranslate = {
    x: baseTranslate.x + panTranslate.x,
    y: baseTranslate.y + panTranslate.y,
  };
  const zoomed = currentScale > 1.01;

  const clampTranslate = useCallback((x: number, y: number, scale: number) => {
    const maxX = (width * (scale - 1)) / 2;
    const maxY = (height * (scale - 1)) / 2;

    return {
      x: clamp(x, -maxX, maxX),
      y: clamp(y, -maxY, maxY),
    };
  }, [height, width]);

  const resetZoom = useCallback(() => {
    setBaseScale(1);
    setPinchScale(1);
    setBaseTranslate({ x: 0, y: 0 });
    setPanTranslate({ x: 0, y: 0 });
    onZoomChange(false);
  }, [onZoomChange]);

  const imageGesture = useMemo(() => {
    const pinchGesture = Gesture.Pinch()
      .runOnJS(true)
      .onUpdate((event) => {
        setPinchScale(event.scale);
      })
      .onEnd((event) => {
        const nextScale = clamp(baseScale * event.scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);

        if (nextScale <= 1.01) {
          resetZoom();
          return;
        }

        setBaseScale(nextScale);
        setPinchScale(1);
        setBaseTranslate((current) => clampTranslate(current.x, current.y, nextScale));
        onZoomChange(true);
      })
      .onFinalize(() => {
        setPinchScale(1);
      });

    const panGesture = Gesture.Pan()
      .enabled(zoomed)
      .runOnJS(true)
      .onUpdate((event) => {
        setPanTranslate({
          x: event.translationX,
          y: event.translationY,
        });
      })
      .onEnd((event) => {
        const nextTranslate = clampTranslate(
          baseTranslate.x + event.translationX,
          baseTranslate.y + event.translationY,
          currentScale,
        );

        setBaseTranslate(nextTranslate);
        setPanTranslate({ x: 0, y: 0 });
      })
      .onFinalize(() => {
        setPanTranslate({ x: 0, y: 0 });
      });

    const doubleTapGesture = Gesture.Tap()
      .enabled(zoomed)
      .numberOfTaps(2)
      .runOnJS(true)
      .onEnd((_event, success) => {
        if (success) {
          resetZoom();
        }
      });

    return Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);
  }, [
    baseScale,
    baseTranslate.x,
    baseTranslate.y,
    clampTranslate,
    currentScale,
    onZoomChange,
    resetZoom,
    zoomed,
  ]);

  return (
    <GestureDetector gesture={imageGesture}>
      <View style={[styles.zoomGestureSurface, { width, height }]}>
        <View
          style={[
            styles.zoomImageWrap,
            {
              width,
              height,
              transform: [
                { translateX: currentTranslate.x },
                { translateY: currentTranslate.y },
                { scale: currentScale },
              ],
            },
          ]}
        >
          <Image resizeMode="cover" source={{ uri }} style={[styles.image, { width, height }]} />
        </View>
      </View>
    </GestureDetector>
  );
}

export default function WaypointPhotoViewerScreen({
  attachments,
  hasNextGroup = false,
  hasPreviousGroup = false,
  nextGroupTitle = null,
  onBack,
  onScrollPastEnd,
  onScrollPastStart,
  onRemoveCurrent,
  previousGroupTitle = null,
  readOnly = false,
  routeCoordinates = [],
  selectedAttachmentId,
  tripTitle,
  waypointCoordinate = null,
  waypointTitle,
}: WaypointPhotoViewerScreenProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  const transitionOpacity = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView | null>(null);
  const initialIndex = useMemo(
    () => attachments.findIndex((attachment) => attachment.localId === selectedAttachmentId),
    [attachments, selectedAttachmentId],
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const [zoomedAttachmentId, setZoomedAttachmentId] = useState<string | null>(null);
  const [transitionTitle, setTransitionTitle] = useState<string | null>(null);
  const [transitionDirection, setTransitionDirection] = useState<"Next" | "Previous" | null>(null);
  const [routeExpanded, setRouteExpanded] = useState(false);
  const currentAttachment = attachments[currentIndex] ?? null;
  const leadingPageCount = hasPreviousGroup ? 1 : 0;
  const trailingPageIndex = leadingPageCount + attachments.length;
  const previewRouteCoordinates = useMemo(() => downsampleRouteCoordinates(routeCoordinates), [routeCoordinates]);
  const routePreviewRegion = useMemo(
    () => buildRoutePreviewRegion(waypointCoordinate ? [...previewRouteCoordinates, waypointCoordinate] : previewRouteCoordinates),
    [previewRouteCoordinates, waypointCoordinate],
  );
  const routePreviewSize = routePreviewRegion ? getRoutePreviewSize(routePreviewRegion) : null;

  useEffect(() => {
    const nextIndex = initialIndex >= 0 ? initialIndex : 0;
    setCurrentIndex(nextIndex);
    setZoomedAttachmentId(null);
    setRouteExpanded(false);

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        x: (nextIndex + leadingPageCount) * screenWidth,
        animated: false,
      });
    });
  }, [initialIndex, leadingPageCount, screenWidth]);

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextPageIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);

    if (hasPreviousGroup && nextPageIndex === 0) {
      startWaypointTransition(previousGroupTitle ?? "Previous waypoint", "Previous", onScrollPastStart);
      return;
    }

    if (hasNextGroup && nextPageIndex === trailingPageIndex) {
      startWaypointTransition(nextGroupTitle ?? "Next waypoint", "Next", onScrollPastEnd);
      return;
    }

    setCurrentIndex(clamp(nextPageIndex - leadingPageCount, 0, attachments.length - 1));
  }

  function startWaypointTransition(
    title: string,
    direction: "Next" | "Previous",
    onTransitionEnd: (() => void) | undefined,
  ) {
    setTransitionTitle(title);
    setTransitionDirection(direction);
    setRouteExpanded(false);
    transitionOpacity.setValue(0);

    Animated.timing(transitionOpacity, {
      toValue: 1,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      onTransitionEnd?.();
    });
  }

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <ScrollView
        horizontal
        onMomentumScrollEnd={handleMomentumScrollEnd}
        pagingEnabled
        ref={scrollRef}
        scrollEnabled={!zoomedAttachmentId}
        showsHorizontalScrollIndicator={false}
        style={styles.pager}
      >
        {hasPreviousGroup ? <View style={[styles.slide, { width: screenWidth, height: screenHeight }]} /> : null}
        {attachments.map((attachment) => (
          <View key={attachment.localId} style={[styles.slide, { width: screenWidth, height: screenHeight }]}>
            <ZoomablePhoto
              height={screenHeight}
              onZoomChange={(isZoomed) => {
                setZoomedAttachmentId(isZoomed ? attachment.localId : null);

                if (!isZoomed) {
                  requestAnimationFrame(() => {
                    scrollRef.current?.scrollTo({
                      x: (currentIndex + leadingPageCount) * screenWidth,
                      animated: false,
                    });
                  });
                }
              }}
              uri={attachment.localUri}
              width={screenWidth}
            />
          </View>
        ))}
        {hasNextGroup ? <View style={[styles.slide, { width: screenWidth, height: screenHeight }]} /> : null}
      </ScrollView>

      {tripTitle ? (
        <View pointerEvents="box-none" style={styles.topOverlay}>
          <Text numberOfLines={1} style={styles.topInfo}>
            {tripTitle}
          </Text>
        </View>
      ) : null}

      {routeExpanded && routePreviewRegion && routePreviewSize && waypointCoordinate ? (
        <View style={styles.expandedRoute}>
          <MapView
            key={`expanded:${routePreviewRegion.latitude}:${routePreviewRegion.longitude}:${routePreviewRegion.latitudeDelta}:${routePreviewRegion.longitudeDelta}`}
            mapType="standard"
            pitchEnabled={false}
            region={routePreviewRegion}
            rotateEnabled={false}
            style={styles.expandedRouteMap}
            toolbarEnabled={false}
          >
            {previewRouteCoordinates.length > 1 ? (
              <Polyline
                coordinates={previewRouteCoordinates}
                strokeColor={ROUTE_PREVIEW_LINE_COLOR}
                strokeWidth={4}
              />
            ) : null}
            <Marker coordinate={waypointCoordinate} pinColor="#e53935" tracksViewChanges={false} />
          </MapView>
          <Pressable
            accessibilityLabel="Back to photo"
            onPress={() => setRouteExpanded(false)}
            style={StyleSheet.absoluteFill}
          />
          {currentAttachment ? (
            <Pressable
              accessibilityLabel="Back to photo"
              onPress={() => setRouteExpanded(false)}
              style={[
                styles.photoPreview,
                routePreviewSize,
                { bottom: Math.max(88, safeAreaInsets.bottom + 84) },
              ]}
            >
              <Image resizeMode="cover" source={{ uri: currentAttachment.localUri }} style={styles.photoPreviewImage} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!routeExpanded && routePreviewRegion && routePreviewSize && waypointCoordinate ? (
        <Pressable
          accessibilityLabel="Open route preview"
          onPress={() => setRouteExpanded(true)}
          style={[
            styles.routePreview,
            routePreviewSize,
            { bottom: Math.max(88, safeAreaInsets.bottom + 84) },
          ]}
        >
          <MapView
            key={`${routePreviewRegion.latitude}:${routePreviewRegion.longitude}:${routePreviewRegion.latitudeDelta}:${routePreviewRegion.longitudeDelta}`}
            region={routePreviewRegion}
            liteMode={Platform.OS === "android"}
            mapType="standard"
            pitchEnabled={false}
            pointerEvents="none"
            rotateEnabled={false}
            scrollEnabled={false}
            style={styles.routePreviewMap}
            toolbarEnabled={false}
            zoomEnabled={false}
          >
            {previewRouteCoordinates.length > 1 ? (
              <Polyline
                coordinates={previewRouteCoordinates}
                strokeColor={ROUTE_PREVIEW_LINE_COLOR}
                strokeWidth={3}
              />
            ) : null}
            <Marker coordinate={waypointCoordinate} pinColor="#e53935" tracksViewChanges={false} />
          </MapView>
        </Pressable>
      ) : null}

      <View
        pointerEvents="box-none"
        style={[
          styles.bottomOverlay,
          { bottom: Math.max(22, safeAreaInsets.bottom + 18) },
        ]}
      >
        <Pressable
          accessibilityLabel="Back to waypoint"
          hitSlop={14}
          onPress={onBack}
          style={styles.iconButton}
        >
          <MaterialIcons color="#fffdf8" name="arrow-back" size={24} />
        </Pressable>
        <Text numberOfLines={1} style={styles.bottomInfo}>
          {attachments.length === 0 ? "0 / 0" : `${currentIndex + 1} / ${attachments.length}`} · {waypointTitle}
        </Text>
        {currentAttachment && !readOnly && onRemoveCurrent ? (
          <Pressable
            accessibilityLabel="Remove current photo"
            hitSlop={14}
            onPress={() => onRemoveCurrent(currentAttachment.localId)}
            style={[styles.iconButton, styles.removeIconButton]}
          >
            <MaterialIcons color="#fffdf8" name="delete-outline" size={24} />
          </Pressable>
        ) : null}
      </View>

      {transitionTitle && transitionDirection ? (
        <Animated.View pointerEvents="none" style={[styles.transitionOverlay, { opacity: transitionOpacity }]}>
          <Text style={styles.transitionEyebrow}>{transitionDirection} waypoint</Text>
          <Text numberOfLines={2} style={styles.transitionTitle}>
            {transitionTitle}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0c100c",
  },
  pager: {
    flex: 1,
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0c100c",
  },
  image: {
    backgroundColor: "#0c100c",
  },
  zoomGestureSurface: {
    overflow: "hidden",
  },
  zoomImageWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  topOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 36,
    alignItems: "center",
  },
  topInfo: {
    maxWidth: "86%",
    fontSize: 13,
    fontWeight: "600",
    color: "#fffdf8",
    textAlign: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(12, 16, 12, 0.44)",
  },
  bottomOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    zIndex: 10,
    elevation: 10,
  },
  bottomInfo: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#fffdf8",
    textAlign: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(12, 16, 12, 0.44)",
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(12, 16, 12, 0.44)",
    borderWidth: 1,
    borderColor: "rgba(255, 253, 248, 0.24)",
  },
  removeIconButton: {
    backgroundColor: "rgba(143, 52, 40, 0.58)",
  },
  routePreview: {
    position: "absolute",
    right: 18,
    opacity: 0.66,
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 253, 248, 0.28)",
    backgroundColor: "rgba(12, 16, 12, 0.44)",
    zIndex: 8,
    elevation: 8,
  },
  routePreviewMap: {
    width: "100%",
    height: "100%",
  },
  expandedRoute: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 7,
    elevation: 7,
    backgroundColor: "#0c100c",
  },
  expandedRouteMap: {
    width: "100%",
    height: "100%",
  },
  photoPreview: {
    position: "absolute",
    right: 18,
    opacity: 0.86,
    overflow: "hidden",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 253, 248, 0.28)",
    backgroundColor: "rgba(12, 16, 12, 0.44)",
    zIndex: 9,
    elevation: 9,
  },
  photoPreviewImage: {
    width: "100%",
    height: "100%",
  },
  transitionOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "rgba(12, 16, 12, 0.64)",
  },
  transitionEyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "rgba(255, 253, 248, 0.66)",
    textTransform: "uppercase",
  },
  transitionTitle: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
    color: "#fffdf8",
    textAlign: "center",
  },
});
