import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import Card from "../../../components/ui/card";

interface GroupDraft {
  description: string;
  title: string;
}

interface Props {
  draft: GroupDraft;
  syncingGroups: boolean;
  visible: boolean;
  onChangeDraftDescription: (description: string) => void;
  onChangeDraftTitle: (title: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function TripGroupEditModal({
  draft,
  syncingGroups,
  visible,
  onChangeDraftDescription,
  onChangeDraftTitle,
  onClose,
  onSave,
}: Props) {
  const isSaveDisabled = syncingGroups || draft.title.trim().length === 0;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
        style={styles.keyboard}
      >
        <View style={styles.backdrop}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Card style={styles.card} title="Edit group" titleStyle={styles.title}>
              <View style={styles.newGroupBlock}>
                <Text style={styles.label}>Group details</Text>
                <TextInput
                  onChangeText={onChangeDraftTitle}
                  placeholder="Title"
                  placeholderTextColor="#8a9784"
                  style={styles.input}
                  value={draft.title}
                />
                <TextInput
                  multiline
                  onChangeText={onChangeDraftDescription}
                  placeholder="Description"
                  placeholderTextColor="#8a9784"
                  style={[styles.input, styles.descriptionInput]}
                  value={draft.description}
                />
              </View>
              <View style={styles.actions}>
                <Pressable onPress={onClose} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={isSaveDisabled}
                  onPress={onSave}
                  style={[styles.primaryButton, isSaveDisabled && styles.buttonDisabled]}
                >
                  <Text style={styles.primaryText}>{syncingGroups ? "Saving..." : "Save"}</Text>
                </Pressable>
              </View>
            </Card>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20, 28, 20, 0.36)" },
  keyboard: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { gap: 14 },
  title: { fontSize: 22, fontWeight: "800", color: "#243224" },
  label: { fontSize: 12, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase", color: "#76856f" },
  newGroupBlock: { gap: 8 },
  input: { borderRadius: 14, backgroundColor: "#f6f1e5", borderWidth: 1, borderColor: "#ebe1cf", color: "#243224", fontSize: 15, paddingHorizontal: 12, paddingVertical: 11 },
  descriptionInput: { minHeight: 78, textAlignVertical: "top" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  secondaryButton: { borderRadius: 999, backgroundColor: "#e8ede2", paddingHorizontal: 14, paddingVertical: 11 },
  secondaryText: { fontSize: 14, fontWeight: "800", color: "#355035" },
  primaryButton: { borderRadius: 999, backgroundColor: "#243224", paddingHorizontal: 16, paddingVertical: 11 },
  buttonDisabled: { opacity: 0.62 },
  primaryText: { fontSize: 14, fontWeight: "800", color: "#fffdf8" },
});
