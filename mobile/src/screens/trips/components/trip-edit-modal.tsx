import { StyleSheet, Text, TextInput } from "react-native";

import BottomSheetModal from "../../../components/ui/bottom-sheet-modal";
import ModalActions from "../../../components/ui/modal-actions";
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
    <BottomSheetModal
      keyboardBehavior="padding"
      onClose={onClose}
      title="Edit trip"
      visible={visible}
    >
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

      <ModalActions
        primaryDisabled={!canSave}
        primaryLabel="Save"
        secondaryLabel="Cancel"
        onPrimaryPress={onSave}
        onSecondaryPress={onClose}
      />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
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
});
