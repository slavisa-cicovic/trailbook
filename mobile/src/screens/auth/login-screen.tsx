import { useRef } from "react";
import { Redirect, useRouter } from "expo-router";
import { Image, StyleSheet, Text, TextInput, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import FormField from "../../components/ui/form-field";
import PrimaryButton from "../../components/ui/primary-button";
import {
  areHardcodedCredentialsValid,
  canCreateTemporarySession,
  createTemporarySession,
} from "../../services/auth/temporary-login.service";
import {
  setActiveIdentitySession,
  updateSessionCredentials,
  useSessionStore,
} from "../../state/session-store";
import {
  reconcileHydratedRecordingState,
  setRecordingSession,
  useRecordingStore,
} from "../../state/recording-store";
import { getTripsStateSnapshot } from "../../state/trips-store";

export default function LoginScreen() {
  const router = useRouter();
  const passwordInputRef = useRef<TextInput>(null);
  const credentials = useSessionStore((state) => state.credentials);
  const deviceId = useSessionStore((state) => state.deviceId);
  const identitySession = useSessionStore((state) => state.identitySession);
  const recordingSession = useRecordingStore((state) => state.session);
  const canSignIn = canCreateTemporarySession(credentials, deviceId);
  const credentialsMatch = areHardcodedCredentialsValid(credentials);

  async function handleSignIn() {
    if (!canSignIn || !credentialsMatch) {
      return;
    }

    const session = createTemporarySession(credentials, deviceId);

    await setActiveIdentitySession(session);
    await setRecordingSession({
      ...recordingSession,
      userId: session.userId,
      userEmail: session.userEmail,
      deviceId: session.deviceId,
    });
    await reconcileHydratedRecordingState(getTripsStateSnapshot().trips);

    router.replace("/recording");
  }

  if (identitySession) {
    return <Redirect href="/recording" />;
  }

  return (
    <ScreenLayout>
      <View style={styles.hero}>
        <Image
          resizeMode="contain"
          source={require("../../../assets/login-screen.png")}
          style={styles.heroImage}
        />
      </View>

      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        label="User email"
        onChangeText={(email) => updateSessionCredentials({ email })}
        onSubmitEditing={() => passwordInputRef.current?.focus()}
        placeholder="user@example.com"
        returnKeyType="next"
        value={credentials.email}
      />

      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        label="Password"
        onChangeText={(password) => updateSessionCredentials({ password })}
        onSubmitEditing={() => void handleSignIn()}
        placeholder="temporary password"
        ref={passwordInputRef}
        returnKeyType="done"
        secureTextEntry
        submitBehavior="submit"
        value={credentials.password}
      />

      {!credentialsMatch && credentials.password.length > 0 ? (
        <Text style={styles.errorText}>Use the current development login credentials.</Text>
      ) : null}

      <PrimaryButton disabled={!canSignIn || !credentialsMatch} onPress={() => void handleSignIn()}>
        Login
      </PrimaryButton>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    paddingVertical: 16,
    borderRadius: 28,
    backgroundColor: "#e3efe1",
  },
  heroImage: {
    width: 220,
    height: 220,
  },
  errorText: {
    fontSize: 14,
    color: "#b24b38",
    marginBottom: 8,
  },
});
