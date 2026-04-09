import { useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import FormField from "../../components/ui/form-field";
import PrimaryButton from "../../components/ui/primary-button";
import { createBackendAuthenticatedSession } from "../../domain/identity";
import { registerWithBackend } from "../../services/auth/mobile-auth.service";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import {
  reconcileHydratedRecordingState,
  setRecordingSession,
  useRecordingStore,
} from "../../state/recording-store";
import { getTripSegmentsStateSnapshot } from "../../state/trip-segments-store";
import { getTripsStateSnapshot } from "../../state/trips-store";

export default function RegisterScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);
  const deviceId = useSessionStore((state) => state.deviceId);
  const recordingSession = useRecordingStore((state) => state.session);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function finalizeSignIn(sessionToken: string, user: Parameters<typeof createBackendAuthenticatedSession>[0]) {
    if (!deviceId) {
      return;
    }

    const session = createBackendAuthenticatedSession(user, sessionToken, deviceId);

    await setActiveIdentitySession(session);
    await setRecordingSession({
      ...recordingSession,
      userId: session.userId,
      userEmail: session.userEmail,
      deviceId: session.deviceId,
    });
    await reconcileHydratedRecordingState(
      getTripsStateSnapshot().trips,
      getTripSegmentsStateSnapshot().tripSegments,
    );

    router.replace("/recording");
  }

  async function handleRegister() {
    setBusy(true);
    setErrorMessage(null);

    try {
      const result = await registerWithBackend({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
      });

      await finalizeSignIn(result.sessionToken, result.user);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  if (identitySession) {
    return <Redirect href="/recording" />;
  }

  return (
    <ScreenLayout onBack={() => router.back()} title="Create account">
      <Text style={styles.subtitle}>Create a Trailbook account for sync, sharing, and full route access.</Text>

      <FormField
        autoCapitalize="words"
        autoCorrect={false}
        label="Display name"
        onChangeText={setDisplayName}
        onSubmitEditing={() => emailRef.current?.focus()}
        placeholder="Your name"
        returnKeyType="next"
        value={displayName}
      />

      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        onSubmitEditing={() => passwordRef.current?.focus()}
        placeholder="you@example.com"
        ref={emailRef}
        returnKeyType="next"
        value={email}
      />

      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        label="Password"
        onChangeText={setPassword}
        placeholder="minimum 8 characters"
        ref={passwordRef}
        returnKeyType="done"
        secureTextEntry
        value={password}
      />

      <PrimaryButton
        disabled={busy || displayName.trim().length < 2 || email.trim().length === 0 || password.length < 8}
        onPress={() => void handleRegister()}
      >
        {busy ? "Creating account..." : "Create account"}
      </PrimaryButton>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Already have an account?</Text>
        <Pressable onPress={() => router.replace("/login")}>
          <Text style={styles.linkText}>Back to login</Text>
        </Pressable>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
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
});
