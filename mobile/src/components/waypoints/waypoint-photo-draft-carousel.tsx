import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type { PickedPhoto } from "../../services/media/photo-picker.service";

interface WaypointPhotoDraftCarouselProps {
  cardWidth: number;
  emptyLabel?: string;
  onRemovePhoto: (index: number) => void;
  photos: PickedPhoto[];
}

export default function WaypointPhotoDraftCarousel({
  cardWidth,
  emptyLabel = "No photos selected yet.",
  onRemovePhoto,
  photos,
}: WaypointPhotoDraftCarouselProps) {
  if (photos.length === 0) {
    return (
      <View style={styles.photoPlaceholder}>
        <Text style={styles.photoPlaceholderText}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.photoDraftCarouselContent}
      decelerationRate="fast"
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={cardWidth + 12}
    >
      {photos.map((photo, index) => (
        <View
          key={`${photo.localUri}-${index}`}
          style={[styles.photoDraftCard, { width: cardWidth }]}
        >
          <Image source={{ uri: photo.localUri }} style={styles.photoPreview} />
          <Pressable
            onPress={() => onRemovePhoto(index)}
            style={styles.removeDraftPhotoButton}
          >
            <Text style={styles.removeDraftPhotoText}>Remove</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  photoDraftCarouselContent: {
    gap: 12,
    paddingBottom: 4,
    paddingRight: 18,
  },
  photoDraftCard: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
  },
  photoPreview: {
    width: "100%",
    aspectRatio: 1.08,
    backgroundColor: "#d7ddcf",
  },
  removeDraftPhotoButton: {
    position: "absolute",
    right: 8,
    top: 8,
    borderRadius: 999,
    backgroundColor: "rgba(247, 224, 219, 0.92)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  removeDraftPhotoText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9f3f31",
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d7ddcf",
    borderRadius: 18,
    backgroundColor: "#f3f6ef",
    minHeight: 110,
    paddingHorizontal: 16,
  },
  photoPlaceholderText: {
    fontSize: 14,
    color: "#60705d",
  },
});
