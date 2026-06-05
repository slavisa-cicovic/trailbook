import { Pressable, StyleSheet, Text, View } from "react-native";

interface WaypointPhotoActionRowProps {
  addPhotosLabel?: string;
  onAddPhotos: () => void;
  onTakePhoto: () => void;
  takePhotoLabel?: string;
}

export default function WaypointPhotoActionRow({
  addPhotosLabel = "Add photos",
  onAddPhotos,
  onTakePhoto,
  takePhotoLabel = "Take photo",
}: WaypointPhotoActionRowProps) {
  return (
    <View style={styles.photoActionRow}>
      <Pressable onPress={onTakePhoto} style={styles.photoActionPrimary}>
        <Text style={styles.photoActionPrimaryText}>{takePhotoLabel}</Text>
      </Pressable>
      <Pressable onPress={onAddPhotos} style={styles.photoActionSecondary}>
        <Text style={styles.photoActionSecondaryText}>{addPhotosLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  photoActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoActionPrimary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#243224",
    paddingVertical: 12,
  },
  photoActionPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fffdf8",
  },
  photoActionSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#3c5a3c",
    paddingVertical: 12,
  },
  photoActionSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fffdf8",
  },
});
