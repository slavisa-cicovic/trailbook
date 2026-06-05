import { StyleSheet } from "react-native";

import BottomSheetModal from "../../../components/ui/bottom-sheet-modal";
import FormField from "../../../components/ui/form-field";
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
      <FormField
        label="Trip name"
        onChangeText={onChangeTitle}
        placeholder="Trip name"
        value={draft.title}
      />

      <FormField
        label="Description"
        multiline
        numberOfLines={4}
        onChangeText={onChangeDescription}
        placeholder="Trip description"
        style={styles.descriptionInput}
        textarea
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
  descriptionInput: {
    minHeight: 110,
  },
});
