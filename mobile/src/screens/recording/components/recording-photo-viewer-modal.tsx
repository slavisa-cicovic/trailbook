import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { WaypointAttachment } from "../../../domain/trips";

interface Props {
  attachment: WaypointAttachment | null;
  hasNext: boolean;
  hasPrevious: boolean;
  index: number;
  totalCount: number;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onRemove: (attachmentLocalId: string) => void;
}

export default function RecordingPhotoViewerModal({
  attachment,
  hasNext,
  hasPrevious,
  index,
  totalCount,
  onClose,
  onNext,
  onPrevious,
  onRemove,
}: Props) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={attachment !== null}
    >
      <View style={styles.backdrop}>
        <Pressable onPress={onClose} style={styles.backdropPressable} />
        {attachment ? (
          <View style={styles.card}>
            <Image
              resizeMode="contain"
              source={{ uri: attachment.localUri }}
              style={styles.image}
            />
            {totalCount > 1 ? (
              <View style={styles.pager}>
                <Pressable
                  disabled={!hasPrevious}
                  onPress={onPrevious}
                  style={[styles.navButton, !hasPrevious && styles.navButtonDisabled]}
                >
                  <Text style={[styles.navText, !hasPrevious && styles.navTextDisabled]}>Previous</Text>
                </Pressable>
                <Text style={styles.pagerText}>{index + 1} / {totalCount}</Text>
                <Pressable
                  disabled={!hasNext}
                  onPress={onNext}
                  style={[styles.navButton, !hasNext && styles.navButtonDisabled]}
                >
                  <Text style={[styles.navText, !hasNext && styles.navTextDisabled]}>Next</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={[styles.button, styles.buttonSecondary]}>
                <Text style={styles.buttonSecondaryText}>Close</Text>
              </Pressable>
              <Pressable
                onPress={() => onRemove(attachment.localId)}
                style={[styles.button, styles.removeButton]}
              >
                <Text style={styles.removeText}>Remove photo</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(12, 16, 12, 0.86)", alignItems: "center", justifyContent: "center", padding: 20 },
  backdropPressable: { ...StyleSheet.absoluteFillObject },
  card: { width: "100%", maxWidth: 420, borderRadius: 24, backgroundColor: "#101510", padding: 14, gap: 14 },
  image: { width: "100%", height: 420, borderRadius: 18, backgroundColor: "#1b231b" },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  navButton: { minWidth: 92, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: "#243224", paddingHorizontal: 14, paddingVertical: 10 },
  navButtonDisabled: { backgroundColor: "#2d342d", opacity: 0.4 },
  navText: { fontSize: 13, fontWeight: "700", color: "#fffdf8" },
  navTextDisabled: { color: "#cbd4cb" },
  pagerText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#dbe3db", textAlign: "center" },
  actions: { flexDirection: "row", gap: 10 },
  button: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14 },
  buttonSecondary: { backgroundColor: "#e6ece1" },
  buttonSecondaryText: { fontSize: 16, fontWeight: "700", color: "#243224" },
  removeButton: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: "#8f3428", paddingVertical: 14 },
  removeText: { fontSize: 16, fontWeight: "700", color: "#fff7f4" },
});
