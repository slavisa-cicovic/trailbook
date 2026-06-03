import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface TripShareModalProps {
  busy?: boolean;
  errorMessage?: string | null;
  existingShares?: {
    createdAt: string;
    id: string;
    recipient: { displayName: string; email: string; id: string };
    revokedAt: string | null;
    status: "active" | "revoked";
  }[];
  onChangeRecipientEmail: (value: string) => void;
  onClose: () => void;
  onShare: () => void;
  recipientEmail: string;
  recipientSuggestions?: { displayName: string; email: string; id: string }[];
  successMessage?: string | null;
  visible: boolean;
}

export default function TripShareModal({
  busy = false,
  errorMessage = null,
  existingShares = [],
  onChangeRecipientEmail,
  onClose,
  onShare,
  recipientEmail,
  recipientSuggestions = [],
  successMessage = null,
  visible,
}: TripShareModalProps) {
  const canShare = recipientEmail.trim().length > 0 && !busy;
  const normalizedRecipientEmail = recipientEmail.trim().toLowerCase();
  const activeShareEmails = new Set(
    existingShares
      .filter((share) => share.status === "active" && share.revokedAt === null)
      .map((share) => share.recipient.email.toLowerCase()),
  );
  const filteredSuggestions =
    normalizedRecipientEmail.length >= 3
      ? recipientSuggestions.filter(
          (recipient) =>
            !activeShareEmails.has(recipient.email.toLowerCase()) &&
            (recipient.email.toLowerCase().includes(normalizedRecipientEmail) ||
              recipient.displayName.toLowerCase().includes(normalizedRecipientEmail)),
        )
      : [];

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.modalScreen}>
        <StatusBar barStyle="dark-content" />
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalKeyboardAvoidingView}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Share trip</Text>
              <Text style={styles.modalSubtitle}>
                Share this trip with one or more existing Trailbook accounts.
              </Text>

              {existingShares.filter((share) => share.status === "active" && share.revokedAt === null).length > 0 ? (
                <View style={styles.shareList}>
                  <Text style={styles.shareListTitle}>Already shared with</Text>
                  {existingShares
                    .filter((share) => share.status === "active" && share.revokedAt === null)
                    .map((share) => (
                      <View key={share.id} style={styles.shareListItem}>
                        <Text style={styles.shareRecipientName}>{share.recipient.displayName}</Text>
                        <Text style={styles.shareRecipientEmail}>{share.recipient.email}</Text>
                      </View>
                    ))}
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Recipient email</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={onChangeRecipientEmail}
                placeholder="friend@example.com"
                placeholderTextColor="#8c9a86"
                style={styles.fieldInput}
                value={recipientEmail}
              />

              {filteredSuggestions.length > 0 ? (
                <View style={styles.suggestionList}>
                  {filteredSuggestions.map((recipient) => (
                    <Pressable
                      key={recipient.id}
                      onPress={() => onChangeRecipientEmail(recipient.email)}
                      style={styles.suggestionItem}
                    >
                      <Text style={styles.suggestionName}>{recipient.displayName}</Text>
                      <Text style={styles.suggestionEmail}>{recipient.email}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
              {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

              <View style={styles.modalActions}>
                <Pressable onPress={onClose} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Close</Text>
                </Pressable>
                <Pressable
                  disabled={!canShare}
                  onPress={onShare}
                  style={[styles.primaryButton, !canShare && styles.disabledButton]}
                >
                  <Text style={styles.primaryButtonText}>{busy ? "Sharing..." : "Share"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalScreen: {
    flex: 1,
    backgroundColor: "rgba(24, 31, 24, 0.36)",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalKeyboardAvoidingView: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalSheet: {
    maxHeight: "84%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#f3efe6",
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  modalHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#c9d2c2",
    marginTop: 10,
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 14,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2a1f",
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: "#52624f",
  },
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
  errorText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#a03a32",
  },
  successText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2f6c42",
  },
  shareList: {
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#ddd7c8",
    padding: 14,
  },
  shareListTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  shareListItem: {
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: "#eee7d9",
    paddingTop: 8,
  },
  shareRecipientName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#243224",
  },
  shareRecipientEmail: {
    fontSize: 13,
    color: "#52624f",
  },
  suggestionList: {
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#fffdf8",
    borderWidth: 1,
    borderColor: "#ddd7c8",
    padding: 10,
  },
  suggestionItem: {
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: "#eee7d9",
    paddingTop: 8,
  },
  suggestionName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#243224",
  },
  suggestionEmail: {
    fontSize: 13,
    color: "#52624f",
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
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#e6ece1",
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  disabledButton: {
    opacity: 0.45,
  },
});
