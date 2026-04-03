import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { WaypointAttachment } from "../../../domain/trips";

interface PhotoViewerModalProps {
  hasNextPhoto: boolean;
  hasPreviousPhoto: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRemove: (attachmentLocalId: string) => void;
  selectedPhotoAttachment: WaypointAttachment | null;
  selectedPhotoIndex: number;
  selectedPhotoWaypointAttachments: WaypointAttachment[];
  visible: boolean;
}

export default function PhotoViewerModal({
  hasNextPhoto,
  hasPreviousPhoto,
  onClose,
  onNext,
  onPrevious,
  onRemove,
  selectedPhotoAttachment,
  selectedPhotoIndex,
  selectedPhotoWaypointAttachments,
  visible,
}: PhotoViewerModalProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.photoViewerBackdrop}>
        <Pressable onPress={onClose} style={styles.photoViewerBackdropPressable} />
        {selectedPhotoAttachment ? (
          <View style={styles.photoViewerCard}>
            <Image
              resizeMode="contain"
              source={{ uri: selectedPhotoAttachment.localUri }}
              style={styles.photoViewerImage}
            />
            {selectedPhotoWaypointAttachments.length > 1 ? (
              <View style={styles.photoViewerPager}>
                <Pressable
                  disabled={!hasPreviousPhoto}
                  onPress={onPrevious}
                  style={[
                    styles.photoViewerNavButton,
                    !hasPreviousPhoto && styles.photoViewerNavButtonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.photoViewerNavText,
                      !hasPreviousPhoto && styles.photoViewerNavTextDisabled,
                    ]}
                  >
                    Previous
                  </Text>
                </Pressable>
                <Text style={styles.photoViewerPagerText}>
                  {selectedPhotoIndex + 1} / {selectedPhotoWaypointAttachments.length}
                </Text>
                <Pressable
                  disabled={!hasNextPhoto}
                  onPress={onNext}
                  style={[
                    styles.photoViewerNavButton,
                    !hasNextPhoto && styles.photoViewerNavButtonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.photoViewerNavText,
                      !hasNextPhoto && styles.photoViewerNavTextDisabled,
                    ]}
                  >
                    Next
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable onPress={onClose} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
              <Pressable
                onPress={() => onRemove(selectedPhotoAttachment.localId)}
                style={styles.photoViewerRemoveButton}
              >
                <Text style={styles.photoViewerRemoveText}>Remove photo</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  photoViewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12, 16, 12, 0.86)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  photoViewerBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  photoViewerCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "#101510",
    padding: 14,
    gap: 14,
  },
  photoViewerImage: {
    width: "100%",
    height: 420,
    borderRadius: 18,
    backgroundColor: "#1b231b",
  },
  photoViewerPager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  photoViewerNavButton: {
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#243224",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  photoViewerNavButtonDisabled: {
    backgroundColor: "#2d342d",
    opacity: 0.4,
  },
  photoViewerNavText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  photoViewerNavTextDisabled: {
    color: "#cbd4cb",
  },
  photoViewerPagerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#dbe3db",
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
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
  photoViewerRemoveButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#8f3428",
    paddingVertical: 14,
  },
  photoViewerRemoveText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff7f4",
  },
});
