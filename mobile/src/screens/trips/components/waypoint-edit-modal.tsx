import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

import BottomSheetModal from "../../../components/ui/bottom-sheet-modal";
import ModalActions from "../../../components/ui/modal-actions";
import {
  WAYPOINT_CATEGORY_OPTIONS,
  getWaypointCategoryOption,
} from "../../../constants/waypoint-categories";
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
      <Text style={styles.fieldLabel}>Title</Text>
      <TextInput
        onChangeText={onChangeTitle}
        placeholder="Waypoint title"
        placeholderTextColor="#8c9a86"
        style={styles.fieldInput}
        value={draft.title}
      />

      <Text style={styles.fieldLabel}>Category</Text>
      <ScrollView
        contentContainerStyle={styles.categoryPickerRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {WAYPOINT_CATEGORY_OPTIONS.map((option) => {
          const selected = option.value === draft.category;

          return (
            <Pressable
              key={option.value}
              onPress={() => onChangeCategory(option.value)}
              style={[
                styles.categoryChip,
                { borderColor: option.color },
                selected && { backgroundColor: option.color },
              ]}
            >
              <MaterialIcons
                color={selected ? "#fffdf8" : option.color}
                name={getWaypointCategoryOption(option.value).iconName}
                size={16}
              />
              <Text
                style={[
                  styles.categoryChipText,
                  selected && styles.categoryChipTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

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
  categoryPickerRow: {
    gap: 8,
    paddingBottom: 4,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  categoryChipTextSelected: {
    color: "#fffdf8",
  },
});
