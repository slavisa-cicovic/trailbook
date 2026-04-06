import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { WaypointUpdateInput } from "../../../services/trips/trips-management.service";

interface WaypointEditModalProps {
  draft: WaypointUpdateInput;
  onChangeNote: (note: string) => void;
  onChangeTitle: (title: string) => void;
  onClose: () => void;
  onSave: () => void;
  visible: boolean;
}

export default function WaypointEditModal({
  draft,
  onChangeNote,
  onChangeTitle,
  onClose,
  onSave,
  visible,
}: WaypointEditModalProps) {
  const canSave = draft.title.trim().length > 0;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.modalScreen}>
        <StatusBar barStyle="dark-content" />
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalKeyboardAvoidingView}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Edit note</Text>

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                onChangeText={onChangeTitle}
                placeholder="Waypoint title"
                placeholderTextColor="#8c9a86"
                style={styles.fieldInput}
                value={draft.title}
              />

              <Text style={styles.fieldLabel}>Note</Text>
              <TextInput
                multiline
                numberOfLines={4}
                onChangeText={onChangeNote}
                placeholder="Waypoint note"
                placeholderTextColor="#8c9a86"
                style={[styles.fieldInput, styles.fieldTextarea]}
                textAlignVertical="top"
                value={draft.note}
              />

              <View style={styles.modalActions}>
                <Pressable onPress={onClose} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!canSave}
                  onPress={onSave}
                  style={[styles.primaryButton, !canSave && styles.disabledButton]}
                >
                  <Text style={styles.primaryButtonText}>Save</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScreen: {
    flex: 1,
    backgroundColor: "rgba(24, 31, 24, 0.36)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalKeyboardAvoidingView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    maxHeight: "84%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#f3efe6",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#c9d2c2",
    marginTop: 10,
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 14,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2a1f",
  },
  fieldLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#60705d",
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: "#d7ddcf",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#243224",
  },
  fieldTextarea: {
    minHeight: 110,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#243224",
    paddingVertical: 14,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fffdf8",
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
  disabledButton: {
    opacity: 0.45,
  },
});
