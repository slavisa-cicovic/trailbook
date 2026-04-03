import { Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { TripUpdateInput } from "../../../services/trips/trips-management.service";

interface TripEditModalProps {
  draft: TripUpdateInput;
  onChangeDescription: (description: string) => void;
  onChangeTitle: (title: string) => void;
  onClose: () => void;
  onSave: () => void;
  visible: boolean;
}

export default function TripEditModal({
  draft,
  onChangeDescription,
  onChangeTitle,
  onClose,
  onSave,
  visible,
}: TripEditModalProps) {
  const canSave = draft.title.trim().length > 0;

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView style={styles.modalScreen}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Edit trip</Text>

          <Text style={styles.fieldLabel}>Trip name</Text>
          <TextInput
            onChangeText={onChangeTitle}
            placeholder="Trip name"
            placeholderTextColor="#8c9a86"
            style={styles.fieldInput}
            value={draft.title}
          />

          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            multiline
            numberOfLines={4}
            onChangeText={onChangeDescription}
            placeholder="Trip description"
            placeholderTextColor="#8c9a86"
            style={[styles.fieldInput, styles.fieldTextarea]}
            textAlignVertical="top"
            value={draft.description}
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
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScreen: {
    flex: 1,
    backgroundColor: "#f3efe6",
  },
  modalContent: {
    padding: 24,
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
