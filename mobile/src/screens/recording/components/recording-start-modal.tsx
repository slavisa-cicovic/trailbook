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

import Card from "../../../components/ui/card";
import FormField from "../../../components/ui/form-field";
import LoadingButton from "../../../components/ui/loading-button";

interface RecordingDraft {
  description: string;
  title: string;
}

interface Props {
  canStart: boolean;
  draft: RecordingDraft;
  starting?: boolean;
  visible: boolean;
  onChangeDraftDescription: (description: string) => void;
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
            subtitle="Give this route a name. Trailbook will infer walking, cycling, and driving segments automatically."
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
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  button: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 14, paddingVertical: 14 },
  buttonSecondary: { backgroundColor: "#e6ece1" },
  buttonSecondaryText: { fontSize: 16, fontWeight: "700", color: "#243224" },
  buttonDisabled: { opacity: 0.45 },
});
