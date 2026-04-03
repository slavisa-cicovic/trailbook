import { Image, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

import type { Trip, Waypoint, WaypointAttachment } from "../../../domain/trips";
import { getRecordingProfileLabel } from "../../../constants/recording-profiles";

interface WaypointDetailsItem {
  attachments: WaypointAttachment[];
  waypoint: Waypoint;
}

interface TripDetailsModalProps {
  distanceText: string;
  onClose: () => void;
  onEditNote: (waypoint: Waypoint) => void;
  onSelectPhoto: (attachmentLocalId: string) => void;
  selectedTrip: Trip | null;
  selectedTripMapCoordinates: Array<{ latitude: number; longitude: number }>;
  selectedTripMapRegion: Region | null;
  waypointItems: WaypointDetailsItem[];
  visible: boolean;
}

export default function TripDetailsModal({
  distanceText,
  onClose,
  onEditNote,
  onSelectPhoto,
  selectedTrip,
  selectedTripMapCoordinates,
  selectedTripMapRegion,
  waypointItems,
  visible,
}: TripDetailsModalProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView style={styles.modalScreen}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.modalContent}>
          {selectedTrip ? (
            <>
              <View style={styles.detailsHeader}>
                <View style={styles.detailsHeaderText}>
                  <Text style={styles.modalTitle}>{selectedTrip.title}</Text>
                  {selectedTrip.description ? (
                    <Text style={styles.detailsDescription}>{selectedTrip.description}</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryKey}>Mode</Text>
                  <Text style={styles.summaryValue}>
                    {getRecordingProfileLabel(selectedTrip.recordingProfile)}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryKey}>Waypoints</Text>
                  <Text style={styles.summaryValue}>{String(waypointItems.length)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryKey}>Photos</Text>
                  <Text style={styles.summaryValue}>
                    {String(waypointItems.reduce((sum, item) => sum + item.attachments.length, 0))}
                  </Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryKey}>Distance</Text>
                  <Text style={styles.summaryValue}>{distanceText}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryKey}>Sync</Text>
                  <Text style={styles.summaryValue}>{selectedTrip.syncStatus}</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Route</Text>
              {selectedTripMapRegion ? (
                <View style={styles.routeMapCard}>
                  <MapView
                    initialRegion={selectedTripMapRegion}
                    region={selectedTripMapRegion}
                    scrollEnabled={false}
                    style={styles.routeMap}
                  >
                    {selectedTripMapCoordinates.length > 1 ? (
                      <Polyline
                        coordinates={selectedTripMapCoordinates}
                        lineCap="round"
                        lineJoin="round"
                        strokeColor="#355035"
                        strokeWidth={4}
                      />
                    ) : null}
                    {waypointItems.map(({ waypoint }) => (
                      <Marker
                        key={waypoint.localId}
                        coordinate={{
                          latitude: waypoint.latitude,
                          longitude: waypoint.longitude,
                        }}
                        title={waypoint.title}
                      />
                    ))}
                  </MapView>
                </View>
              ) : (
                <Text style={styles.empty}>No recorded route points yet.</Text>
              )}

              <Text style={styles.sectionTitle}>Waypoints</Text>
              {waypointItems.length === 0 ? (
                <Text style={styles.empty}>No notes saved on this trip.</Text>
              ) : (
                waypointItems.map(({ waypoint, attachments }) => (
                  <View key={waypoint.localId} style={styles.detailsCard}>
                    <View style={styles.detailsCardHeader}>
                      <Text style={styles.detailsCardTitle}>{waypoint.title}</Text>
                      <Pressable onPress={() => onEditNote(waypoint)} style={styles.inlineLink}>
                        <Text style={styles.inlineLinkText}>Edit note</Text>
                      </Pressable>
                    </View>
                    {waypoint.note ? (
                      <Text style={styles.detailsCardText}>{waypoint.note}</Text>
                    ) : null}
                    <Text style={styles.detailsCardLocation}>
                      Location: {waypoint.latitude.toFixed(5)}, {waypoint.longitude.toFixed(5)}
                    </Text>
                    <Text style={styles.detailsCardMeta}>
                      {new Date(waypoint.createdAt).toLocaleString()}
                    </Text>

                    {attachments.length > 0 ? (
                      <ScrollView
                        contentContainerStyle={styles.attachmentRow}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                      >
                        {attachments.map((attachment) => (
                          <View key={attachment.localId} style={styles.attachmentCard}>
                            <Pressable onPress={() => onSelectPhoto(attachment.localId)}>
                              <Image source={{ uri: attachment.localUri }} style={styles.attachmentImage} />
                            </Pressable>
                          </View>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                ))
              )}

              <View style={styles.modalActions}>
                <Pressable onPress={onClose} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>Close</Text>
                </Pressable>
              </View>
            </>
          ) : null}
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
  detailsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  detailsHeaderText: {
    flex: 1,
    gap: 6,
  },
  detailsDescription: {
    fontSize: 15,
    lineHeight: 21,
    color: "#52624f",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
    rowGap: 10,
  },
  summaryItem: {
    width: "50%",
    paddingHorizontal: 5,
    gap: 2,
  },
  summaryKey: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#76856f",
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#243224",
  },
  sectionTitle: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: "700",
    color: "#243224",
  },
  routeMapCard: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#dfe8db",
    height: 220,
  },
  routeMap: {
    flex: 1,
  },
  empty: {
    fontSize: 15,
    color: "#52624f",
  },
  detailsCard: {
    borderRadius: 18,
    backgroundColor: "#fffdf8",
    padding: 14,
    gap: 8,
  },
  detailsCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailsCardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  inlineLink: {
    paddingVertical: 4,
  },
  inlineLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  detailsCardText: {
    fontSize: 14,
    color: "#4f5f4f",
    lineHeight: 20,
  },
  detailsCardLocation: {
    fontSize: 12,
    fontWeight: "600",
    color: "#52624f",
  },
  detailsCardMeta: {
    fontSize: 12,
    color: "#76856f",
  },
  attachmentRow: {
    gap: 10,
  },
  attachmentCard: {
    width: 150,
  },
  attachmentImage: {
    width: 150,
    height: 150,
    borderRadius: 14,
    backgroundColor: "#d7ddcf",
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
});
