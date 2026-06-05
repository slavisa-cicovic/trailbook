import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { RECORDING_PROFILE_OPTIONS } from "../../../constants/recording-profiles";
import type { RecordingMode } from "../../../domain/trips";
import Card from "../../../components/ui/card";

interface Props {
  activeMode: RecordingMode;
  visible: boolean;
  onClose: () => void;
  onSelectMode: (mode: RecordingMode) => void;
}

export default function RecordingProfileModal({ activeMode, visible, onClose, onSelectMode }: Props) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Card
            style={styles.card}
            subtitle="Choose a fixed mode or let Trailbook infer segments automatically."
            title="Recording mode"
          >
            <View style={styles.profileList}>
              {RECORDING_PROFILE_OPTIONS.map((option) => {
                const selected = option.value === activeMode;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => onSelectMode(option.value)}
                    style={[styles.profileOption, selected && styles.profileOptionSelected]}
                  >
                    <View style={styles.profileOptionHeader}>
                      <Text style={[styles.profileOptionLabel, selected && styles.profileOptionLabelSelected]}>
                        {option.label}
                      </Text>
                      <Text style={[styles.profileOptionTag, selected && styles.profileOptionTagSelected]}>
                        {option.description}
                      </Text>
                    </View>
                    <Text style={[styles.profileOptionHint, selected && styles.profileOptionHintSelected]}>
                      {option.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={[styles.button, styles.buttonSecondary]}>
                <Text style={styles.buttonSecondaryText}>Close</Text>
              </Pressable>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20, 28, 20, 0.42)" },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420 },
  profileList: { gap: 8 },
  profileOption: { borderWidth: 1, borderColor: "#d7ddcf", borderRadius: 16, backgroundColor: "#ffffff", paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  profileOptionSelected: { borderColor: "#243224", backgroundColor: "#edf4e9" },
  profileOptionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  profileOptionLabel: { fontSize: 15, fontWeight: "700", color: "#243224" },
  profileOptionLabelSelected: { color: "#1a261a" },
  profileOptionTag: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: "#60705d" },
  profileOptionTagSelected: { color: "#2d492d" },
  profileOptionHint: { fontSize: 13, color: "#52624f" },
  profileOptionHintSelected: { color: "#384738" },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  button: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14 },
  buttonSecondary: { backgroundColor: "#e6ece1" },
  buttonSecondaryText: { fontSize: 16, fontWeight: "700", color: "#243224" },
});
