import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { TripSegment } from "../../../domain/trips";
import { getRecordingProfileLabel } from "../../../constants/recording-profiles";
import Card from "../../../components/ui/card";

const EDITABLE_PROFILES = ["walk", "bike", "drive", "boat", "plane", "stationary"] as const;
type EditableProfile = (typeof EDITABLE_PROFILES)[number];

interface Props {
  segment: TripSegment | null;
  onClose: () => void;
  onSelectProfile: (profile: EditableProfile) => void;
}

export default function SegmentEditModal({ segment, onClose, onSelectProfile }: Props) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={segment !== null}
    >
      <View style={styles.overlay}>
        <Card
          style={styles.card}
          subtitle={segment ? `Current: ${getRecordingProfileLabel(segment.recordingProfile)}` : undefined}
          title="Change segment profile"
          titleStyle={styles.title}
        >
          <View style={styles.options}>
            {EDITABLE_PROFILES.map((option) => {
              const selected = segment?.recordingProfile === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => onSelectProfile(option)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {getRecordingProfileLabel(option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(22, 29, 22, 0.36)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, borderRadius: 20, gap: 14 },
  title: { fontSize: 18, fontWeight: "700", color: "#243224" },
  options: { gap: 8 },
  option: { borderRadius: 14, backgroundColor: "#eef2ea", paddingHorizontal: 14, paddingVertical: 12 },
  optionSelected: { backgroundColor: "#243224" },
  optionText: { fontSize: 14, fontWeight: "700", color: "#355035" },
  optionTextSelected: { color: "#fffdf8" },
  cancelButton: { alignSelf: "flex-end", paddingHorizontal: 6, paddingVertical: 4 },
  cancelText: { fontSize: 14, fontWeight: "700", color: "#52624f" },
});
