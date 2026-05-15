import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
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

import type { WaypointAttachment } from "../../../domain/trips";

interface WaypointPhotoViewerScreenProps {
  attachments: WaypointAttachment[];
  onBack: () => void;
  onRemoveCurrent?: (attachmentLocalId: string) => void;
  readOnly?: boolean;
  selectedAttachmentId: string | null;
}

export default function WaypointPhotoViewerScreen({
  attachments,
  onBack,
  onRemoveCurrent,
  readOnly = false,
  selectedAttachmentId,
}: WaypointPhotoViewerScreenProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView | null>(null);
  const initialIndex = useMemo(
    () => attachments.findIndex((attachment) => attachment.localId === selectedAttachmentId),
    [attachments, selectedAttachmentId],
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);
  const currentAttachment = attachments[currentIndex] ?? null;

  useEffect(() => {
    const nextIndex = initialIndex >= 0 ? initialIndex : 0;
    setCurrentIndex(nextIndex);

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: false,
      });
    });
  }, [initialIndex, screenWidth]);

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    setCurrentIndex(nextIndex);
  }

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      <ScrollView
        horizontal
        onMomentumScrollEnd={handleMomentumScrollEnd}
        pagingEnabled
        ref={scrollRef}
        showsHorizontalScrollIndicator={false}
        style={styles.pager}
      >
        {attachments.map((attachment) => (
          <View key={attachment.localId} style={[styles.slide, { width: screenWidth, height: screenHeight }]}>
            <Image
              resizeMode="cover"
              source={{ uri: attachment.localUri }}
              style={[styles.image, { width: screenWidth, height: screenHeight }]}
            />
          </View>
        ))}
      </ScrollView>

      <View pointerEvents="box-none" style={styles.topOverlay}>
        <Text style={styles.counter}>
          {attachments.length === 0 ? "0 / 0" : `${currentIndex + 1} / ${attachments.length}`}
        </Text>
      </View>

      <View pointerEvents="box-none" style={styles.bottomOverlay}>
        <Pressable accessibilityLabel="Back to waypoint" onPress={onBack} style={styles.iconButton}>
          <MaterialIcons color="#fffdf8" name="arrow-back" size={24} />
        </Pressable>
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
  topOverlay: {
    position: "absolute",
    top: 18,
    left: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  counter: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fffdf8",
    textAlign: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(12, 16, 12, 0.44)",
  },
  bottomOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
});
