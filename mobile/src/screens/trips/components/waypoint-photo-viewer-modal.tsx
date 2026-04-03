import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import type { WaypointAttachment } from "../../../domain/trips";

interface WaypointPhotoViewerModalProps {
  attachments: WaypointAttachment[];
  onClose: () => void;
  onRemoveCurrent: (attachmentLocalId: string) => void;
  selectedAttachmentId: string | null;
  visible: boolean;
}

const screenWidth = Dimensions.get("window").width;

export default function WaypointPhotoViewerModal({
  attachments,
  onClose,
  onRemoveCurrent,
  selectedAttachmentId,
  visible,
}: WaypointPhotoViewerModalProps) {
  const scrollRef = useRef<ScrollView | null>(null);
  const initialIndex = useMemo(
    () => attachments.findIndex((attachment) => attachment.localId === selectedAttachmentId),
    [attachments, selectedAttachmentId],
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);

  useEffect(() => {
    const nextIndex = initialIndex >= 0 ? initialIndex : 0;
    setCurrentIndex(nextIndex);

    if (!visible) {
      return;
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: false,
      });
    });
  }, [initialIndex, visible]);

  const currentAttachment = attachments[currentIndex] ?? null;

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
    setCurrentIndex(nextIndex);
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable onPress={onClose} style={styles.backdropPressable} />
        <View style={styles.card}>
          <ScrollView
            horizontal
            onMomentumScrollEnd={handleMomentumScrollEnd}
            pagingEnabled
            ref={scrollRef}
            showsHorizontalScrollIndicator={false}
          >
            {attachments.map((attachment) => (
              <View key={attachment.localId} style={styles.slide}>
                <Image resizeMode="contain" source={{ uri: attachment.localUri }} style={styles.image} />
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.counter}>
              {attachments.length === 0 ? "0 / 0" : `${currentIndex + 1} / ${attachments.length}`}
            </Text>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
              {currentAttachment ? (
                <Pressable
                  onPress={() => onRemoveCurrent(currentAttachment.localId)}
                  style={styles.removeButton}
                >
                  <Text style={styles.removeButtonText}>Remove current</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(12, 16, 12, 0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: "100%",
    flex: 1,
    justifyContent: "center",
  },
  slide: {
    width: screenWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  image: {
    width: "100%",
    height: "78%",
    backgroundColor: "#111711",
  },
  footer: {
    paddingHorizontal: 18,
    paddingBottom: 22,
    gap: 12,
  },
  counter: {
    fontSize: 14,
    fontWeight: "600",
    color: "#dbe3db",
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#e6ece1",
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  removeButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#8f3428",
    paddingVertical: 14,
  },
  removeButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff7f4",
  },
});
