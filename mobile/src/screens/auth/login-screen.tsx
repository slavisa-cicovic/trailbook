import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import FormField from "../../components/ui/form-field";
import PrimaryButton from "../../components/ui/primary-button";
import {
  canCreateTemporarySession,
  createTemporarySession,
} from "../../services/auth/temporary-login.service";
import {
  setActiveIdentitySession,
  updateSessionCredentials,
  updateSessionDeviceId,
  useSessionStore,
} from "../../state/session-store";
import { initialRecordingSession, setRecordingSession } from "../../state/recording-store";

export default function LoginScreen() {
  const router = useRouter();
  const credentials = useSessionStore((state) => state.credentials);
  const deviceId = useSessionStore((state) => state.deviceId);
  const identitySession = useSessionStore((state) => state.identitySession);
  const canSignIn = canCreateTemporarySession(credentials, deviceId);

  async function handleSignIn() {
    if (!canSignIn) {
      return;
    }

    const session = createTemporarySession(credentials, deviceId);

    await setActiveIdentitySession(session);
    await setRecordingSession({
      ...initialRecordingSession,
      userId: session.userId,
      userEmail: session.userEmail,
      deviceId: session.deviceId,
    });

    router.replace("/recording");
  }

  if (identitySession) {
    return <Redirect href="/recording" />;
  }

  return (
    <ScreenLayout>
      <Text style={styles.title}>Trailbook</Text>
      <Text style={styles.subtitle}>Set the active user and device before recording starts.</Text>

      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        label="User email"
        onChangeText={(email) => updateSessionCredentials({ email })}
        placeholder="user@example.com"
        value={credentials.email}
      />

      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        label="Password"
        onChangeText={(password) => updateSessionCredentials({ password })}
        placeholder="temporary password"
        secureTextEntry
        value={credentials.password}
      />

      <FormField
        autoCapitalize="none"
        autoCorrect={false}
        label="Device ID"
        onChangeText={updateSessionDeviceId}
        placeholder="ios-local-device-001"
        value={deviceId}
      />

      <PrimaryButton disabled={!canSignIn} onPress={() => void handleSignIn()}>
        Set Active User and Device
      </PrimaryButton>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1f2a1f",
  },
  subtitle: {
    fontSize: 16,
    color: "#52624f",
    marginBottom: 12,
  },
});
