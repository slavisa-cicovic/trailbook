import { StyleSheet } from "react-native";

import BottomSheetModal from "../../../components/ui/bottom-sheet-modal";
import FormField from "../../../components/ui/form-field";
import ModalActions from "../../../components/ui/modal-actions";
import WaypointCategoryPicker from "../../../components/waypoints/waypoint-category-picker";
import type { WaypointCategory } from "../../../domain/trips";
import type { WaypointUpdateInput } from "../../../services/trips/trips-management.service";

interface WaypointEditModalProps {
  draft: WaypointUpdateInput;
  onChangeCategory: (category: WaypointCategory) => void;
  onChangeNote: (note: string) => void;
  onChangeTitle: (title: string) => void;
  onClose: () => void;
  onSave: () => void;
  visible: boolean;
}

export default function WaypointEditModal({
  draft,
  onChangeCategory,
  onChangeNote,
  onChangeTitle,
  onClose,
  onSave,
  visible,
}: WaypointEditModalProps) {
  const canSave = draft.title.trim().length > 0;

  return (
    <BottomSheetModal onClose={onClose} title="Edit note" visible={visible}>
      <FormField
        label="Title"
        onChangeText={onChangeTitle}
        placeholder="Waypoint title"
        value={draft.title}
      />

      <WaypointCategoryPicker
        onChangeCategory={onChangeCategory}
        value={draft.category}
      />

      <FormField
        label="Note"
        multiline
        numberOfLines={4}
        onChangeText={onChangeNote}
        placeholder="Waypoint note"
        style={styles.noteInput}
        textarea
        value={draft.note}
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
  noteInput: {
    minHeight: 110,
  },
});
