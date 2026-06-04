import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import FormField from "../../components/ui/form-field";
import LoadingButton from "../../components/ui/loading-button";
import { forgotPasswordWithBackend } from "../../services/auth/mobile-auth.service";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      await forgotPasswordWithBackend(email.trim());
      setInfoMessage("Check your email for reset instructions. The reset page opens in the browser.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to send reset instructions.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenLayout onBack={() => router.back()} title="Forgot password">
      <Text style={styles.subtitle}>
        Enter your account email. Trailbook will send a reset link and you can finish the reset in the browser.
      </Text>

      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        placeholder="you@example.com"
        returnKeyType="done"
        value={email}
      />

      <LoadingButton
        disabled={busy || email.trim().length === 0}
        loading={busy}
        loadingLabel="Sending..."
        onPress={() => void handleSubmit()}
      >
        Send reset email
      </LoadingButton>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Remembered your password?</Text>
        <Pressable onPress={() => router.replace("/login")}>
          <Text style={styles.linkText}>Back to login</Text>
        </Pressable>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#5d6d5a",
    marginBottom: 14,
  },
  footerRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 12,
  },
  footerText: {
    color: "#6f806b",
    fontSize: 14,
  },
  linkText: {
    color: "#2f5d39",
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    marginTop: 12,
    color: "#9f2f2f",
    fontSize: 14,
    fontWeight: "600",
  },
  infoText: {
    marginTop: 12,
    color: "#2f5d39",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
});
