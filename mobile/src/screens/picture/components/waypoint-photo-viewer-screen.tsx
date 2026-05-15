import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
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
  PanGestureHandler,
  PinchGestureHandler,
  State,
  TapGestureHandler,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
  type TapGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";

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
  selectedAttachmentId: string | null;
  waypointTitle: string;
}

interface ZoomablePhotoProps {
  height: number;
  onZoomChange: (zoomed: boolean) => void;
  uri: string;
  width: number;
}

const MAX_ZOOM_SCALE = 4;
const MIN_ZOOM_SCALE = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function ZoomablePhoto({ height, onZoomChange, uri, width }: ZoomablePhotoProps) {
  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const doubleTapRef = useRef(null);
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

  function clampTranslate(x: number, y: number, scale: number) {
    const maxX = (width * (scale - 1)) / 2;
    const maxY = (height * (scale - 1)) / 2;

    return {
      x: clamp(x, -maxX, maxX),
      y: clamp(y, -maxY, maxY),
    };
  }

  function resetZoom() {
    setBaseScale(1);
    setPinchScale(1);
    setBaseTranslate({ x: 0, y: 0 });
    setPanTranslate({ x: 0, y: 0 });
    onZoomChange(false);
  }

  function handlePinchGesture(event: PinchGestureHandlerGestureEvent) {
    setPinchScale(event.nativeEvent.scale);
  }

  function handlePinchStateChange(event: PinchGestureHandlerStateChangeEvent) {
    if (
      event.nativeEvent.oldState !== State.ACTIVE ||
      (event.nativeEvent.state !== State.END &&
        event.nativeEvent.state !== State.CANCELLED &&
        event.nativeEvent.state !== State.FAILED)
    ) {
      return;
    }

    const nextScale = clamp(baseScale * event.nativeEvent.scale, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);

    if (nextScale <= 1.01) {
      resetZoom();
      return;
    }

    setBaseScale(nextScale);
    setPinchScale(1);
    setBaseTranslate((current) => clampTranslate(current.x, current.y, nextScale));
    onZoomChange(true);
  }

  function handlePanGesture(event: PanGestureHandlerGestureEvent) {
    if (!zoomed) {
      return;
    }

    setPanTranslate({
      x: event.nativeEvent.translationX,
      y: event.nativeEvent.translationY,
    });
  }

  function handlePanStateChange(event: PanGestureHandlerStateChangeEvent) {
    if (
      event.nativeEvent.oldState !== State.ACTIVE ||
      (event.nativeEvent.state !== State.END &&
        event.nativeEvent.state !== State.CANCELLED &&
        event.nativeEvent.state !== State.FAILED)
    ) {
      return;
    }

    const nextTranslate = clampTranslate(
      baseTranslate.x + event.nativeEvent.translationX,
      baseTranslate.y + event.nativeEvent.translationY,
      currentScale,
    );

    setBaseTranslate(nextTranslate);
    setPanTranslate({ x: 0, y: 0 });
  }

  function handleDoubleTapStateChange(event: TapGestureHandlerStateChangeEvent) {
    if (event.nativeEvent.state === State.ACTIVE) {
      resetZoom();
    }
  }

  return (
    <TapGestureHandler
      enabled={zoomed}
      numberOfTaps={2}
      onHandlerStateChange={handleDoubleTapStateChange}
      ref={doubleTapRef}
    >
      <View>
        <PinchGestureHandler
          onGestureEvent={handlePinchGesture}
          onHandlerStateChange={handlePinchStateChange}
          ref={pinchRef}
          simultaneousHandlers={[panRef, doubleTapRef]}
        >
          <View style={[styles.zoomGestureSurface, { width, height }]}>
            <PanGestureHandler
              enabled={zoomed}
              onGestureEvent={handlePanGesture}
              onHandlerStateChange={handlePanStateChange}
              ref={panRef}
              simultaneousHandlers={[pinchRef, doubleTapRef]}
            >
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
            </PanGestureHandler>
          </View>
        </PinchGestureHandler>
      </View>
    </TapGestureHandler>
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
  selectedAttachmentId,
  waypointTitle,
}: WaypointPhotoViewerScreenProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
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
  const currentAttachment = attachments[currentIndex] ?? null;
  const leadingPageCount = hasPreviousGroup ? 1 : 0;
  const trailingPageIndex = leadingPageCount + attachments.length;

  useEffect(() => {
    const nextIndex = initialIndex >= 0 ? initialIndex : 0;
    setCurrentIndex(nextIndex);
    setZoomedAttachmentId(null);

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

      <View pointerEvents="box-none" style={styles.bottomOverlay}>
        <Pressable accessibilityLabel="Back to waypoint" onPress={onBack} style={styles.iconButton}>
          <MaterialIcons color="#fffdf8" name="arrow-back" size={24} />
        </Pressable>
        <Text numberOfLines={1} style={styles.bottomInfo}>
          {attachments.length === 0 ? "0 / 0" : `${currentIndex + 1} / ${attachments.length}`} · {waypointTitle}
        </Text>
        {currentAttachment && !readOnly && onRemoveCurrent ? (
          <Pressable
            accessibilityLabel="Remove current photo"
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
  bottomOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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
