import { useEffect, useRef } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput as TextInputType,
} from "react-native";

import { RECORDING_PROFILE_OPTIONS } from "../../../constants/recording-profiles";
import type { RecordingMode } from "../../../domain/trips";
import Card from "../../../components/ui/card";
import FormField from "../../../components/ui/form-field";
import LoadingButton from "../../../components/ui/loading-button";

interface RecordingDraft {
  description: string;
  recordingMode: RecordingMode;
  title: string;
}

interface Props {
  canStart: boolean;
  draft: RecordingDraft;
  starting?: boolean;
  visible: boolean;
  onChangeDraftDescription: (description: string) => void;
  onChangeDraftMode: (mode: RecordingMode) => void;
  onChangeDraftTitle: (title: string) => void;
  onClose: () => void;
  onStart: () => void;
}

export default function RecordingStartModal({
  canStart,
  draft,
  starting = false,
  visible,
  onChangeDraftDescription,
  onChangeDraftMode,
  onChangeDraftTitle,
  onClose,
  onStart,
}: Props) {
  const titleInputRef = useRef<TextInputType>(null);
  const descriptionInputRef = useRef<TextInputType>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const timeoutId = setTimeout(() => {
      titleInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [visible]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Card
            style={styles.card}
            subtitle="Give this route a name and choose the recording mode before the trip starts."
            title="Start recording"
          >
            <FormField
              autoCapitalize="sentences"
              autoCorrect
              enablesReturnKeyAutomatically
              enterKeyHint="next"
              label="Route name"
              onChangeText={onChangeDraftTitle}
              onSubmitEditing={() => descriptionInputRef.current?.focus()}
              placeholder="e.g. Drive to Belgrade"
              ref={titleInputRef}
              returnKeyType="next"
              value={draft.title}
            />

            <FormField
              autoCapitalize="sentences"
              autoCorrect
              blurOnSubmit
              enterKeyHint="done"
              label="Description"
              multiline
              numberOfLines={3}
              onChangeText={onChangeDraftDescription}
              onSubmitEditing={() => Keyboard.dismiss()}
              placeholder="Optional notes. You can also dictate with the keyboard microphone."
              ref={descriptionInputRef}
              returnKeyType="done"
              textarea
              value={draft.description}
            />

            <Text style={styles.fieldLabel}>Recording mode</Text>
            <View style={styles.profileList}>
              {RECORDING_PROFILE_OPTIONS.map((option) => {
                const selected = option.value === draft.recordingMode;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => onChangeDraftMode(option.value)}
                    style={[styles.profileOption, selected && styles.profileOptionSelected]}
                  >
                    <View style={styles.profileOptionHeader}>
                      <Text style={[styles.profileOptionLabel, selected && styles.profileOptionLabelSelected]}>
                        {option.label}
                      </Text>
                      <Text style={[styles.profileOptionTag, selected && styles.profileOptionTagSelected]}>
                        {option.description}
                      </Text>
                    </View>
                    <Text style={[styles.profileOptionHint, selected && styles.profileOptionHintSelected]}>
                      {option.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.actions}>
              <Pressable
                disabled={starting}
                onPress={onClose}
                style={[styles.button, styles.buttonSecondary, starting && styles.buttonDisabled]}
              >
                <Text style={styles.buttonSecondaryText}>Cancel</Text>
              </Pressable>
              <LoadingButton
                disabled={!canStart}
                loading={starting}
                loadingLabel="Starting..."
                onPress={onStart}
                style={styles.button}
                variant="primary"
              >
                Start
              </LoadingButton>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20, 28, 20, 0.42)" },
  scrollContent: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 420 },
  fieldLabel: { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8, color: "#60705d" },
  profileList: { gap: 8 },
  profileOption: { borderWidth: 1, borderColor: "#d7ddcf", borderRadius: 16, backgroundColor: "#ffffff", paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  profileOptionSelected: { borderColor: "#243224", backgroundColor: "#edf4e9" },
  profileOptionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  profileOptionLabel: { fontSize: 15, fontWeight: "700", color: "#243224" },
  profileOptionLabelSelected: { color: "#1a261a" },
  profileOptionTag: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, color: "#60705d" },
  profileOptionTagSelected: { color: "#2d492d" },
  profileOptionHint: { fontSize: 13, color: "#52624f" },
  profileOptionHintSelected: { color: "#384738" },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  button: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14 },
  buttonSecondary: { backgroundColor: "#e6ece1" },
  buttonSecondaryText: { fontSize: 16, fontWeight: "700", color: "#243224" },
  buttonDisabled: { opacity: 0.45 },
});
