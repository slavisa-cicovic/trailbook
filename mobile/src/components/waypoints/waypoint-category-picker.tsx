import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { WAYPOINT_CATEGORY_OPTIONS } from "../../constants/waypoint-categories";
import type { WaypointCategory } from "../../domain/trips";

interface WaypointCategoryPickerProps {
  label?: string;
  onChangeCategory: (category: WaypointCategory) => void;
  value: WaypointCategory;
}

export default function WaypointCategoryPicker({
  label = "Category",
  onChangeCategory,
  value,
}: WaypointCategoryPickerProps) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <ScrollView
        contentContainerStyle={styles.categoryPickerRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {WAYPOINT_CATEGORY_OPTIONS.map((option) => {
          const selected = option.value === value;

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
                name={option.iconName}
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
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#60705d",
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
