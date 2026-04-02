import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

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
      <View style={styles.hero}>
        <View style={styles.heroPhone}>
          <View style={styles.heroScreen}>
            <View style={styles.heroRoute} />
            <View style={styles.heroPin} />
            <View style={styles.heroDotTop} />
            <View style={styles.heroDotBottom} />
          </View>
        </View>
      </View>

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

      <PrimaryButton disabled={!canSignIn} onPress={() => void handleSignIn()}>
        Continue on This Device
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
  hero: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    paddingVertical: 8,
  },
  heroPhone: {
    width: 154,
    height: 220,
    borderRadius: 32,
    backgroundColor: "#243224",
    padding: 12,
    shadowColor: "#243224",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  heroScreen: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "#eef4e7",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  heroRoute: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 10,
    borderColor: "#b8d3a8",
    borderStyle: "dashed",
  },
  heroPin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#d96c3f",
    borderWidth: 6,
    borderColor: "#fff7ef",
  },
  heroDotTop: {
    position: "absolute",
    top: 42,
    right: 34,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#4f8f62",
  },
  heroDotBottom: {
    position: "absolute",
    bottom: 36,
    left: 30,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#6c8fdd",
  },
});
