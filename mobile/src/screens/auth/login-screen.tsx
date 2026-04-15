import { useEffect, useRef, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import FormField from "../../components/ui/form-field";
import PrimaryButton from "../../components/ui/primary-button";
import { DEMO_CREDENTIALS, createBackendAuthenticatedSession, type AuthProvider } from "../../domain/identity";
import {
  forgotPasswordWithBackend,
  getMobileSocialProviderAvailability,
  loginWithBackend,
  signInWithSocialProvider,
} from "../../services/auth/mobile-auth.service";
import { showEnterDemoModeDialog } from "../../services/demo/demo-mode.service";
import { canCreateTemporarySession, createTemporarySession } from "../../services/auth/temporary-login.service";
import {
  clearSessionCredentials,
  setActiveIdentitySession,
  updateSessionCredentials,
  useSessionStore,
} from "../../state/session-store";
import {
  reconcileHydratedRecordingState,
  setRecordingSession,
  useRecordingStore,
} from "../../state/recording-store";
import { getTripSegmentsStateSnapshot } from "../../state/trip-segments-store";
import { getTripsStateSnapshot } from "../../state/trips-store";

type SocialProviderAvailability = Record<Exclude<AuthProvider, "local">, boolean>;

const emptyProviderAvailability: SocialProviderAvailability = {
  google: false,
  apple: false,
  facebook: false,
};

export default function LoginScreen() {
  const router = useRouter();
  const passwordInputRef = useRef<TextInput>(null);
  const credentials = useSessionStore((state) => state.credentials);
  const deviceId = useSessionStore((state) => state.deviceId);
  const identitySession = useSessionStore((state) => state.identitySession);
  const recordingSession = useRecordingStore((state) => state.session);
  const [busyAction, setBusyAction] = useState<"login" | "demo" | "google" | "apple" | "facebook" | null>(null);
  const [socialProviders, setSocialProviders] = useState<SocialProviderAvailability>(emptyProviderAvailability);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [passwordVisible, setPasswordVisible] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProviderAvailability() {
      try {
        const availability = await getMobileSocialProviderAvailability();

        if (active) {
          setSocialProviders(availability);
        }
      } catch {
        if (active) {
          setSocialProviders(emptyProviderAvailability);
        }
      }
    }

    void loadProviderAvailability();

    return () => {
      active = false;
    };
  }, []);

  async function finalizeSession(session: ReturnType<typeof createTemporarySession>) {
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

  async function handleLogin() {
    if (!deviceId) {
      return;
    }

    setBusyAction("login");
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const result = await loginWithBackend({
        email: credentials.email.trim(),
        password: credentials.password,
      });

      await finalizeSession(
        createBackendAuthenticatedSession(result.user, result.sessionToken, deviceId),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEnterDemo() {
    if (!deviceId) {
      return;
    }

    setBusyAction("demo");
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const demoCredentials = {
        email: DEMO_CREDENTIALS.email,
        password: DEMO_CREDENTIALS.password,
      };

      updateSessionCredentials(demoCredentials);

      if (!canCreateTemporarySession(demoCredentials, deviceId)) {
        throw new Error("Demo mode is not available on this device.");
      }

      await finalizeSession(createTemporarySession(deviceId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to enter demo mode.");
    } finally {
      setBusyAction(null);
    }
  }

  function handlePromptEnterDemo() {
    showEnterDemoModeDialog(() => {
      void handleEnterDemo();
    });
  }

  async function handleForgotPasswordInline() {
    if (!credentials.email.trim()) {
      setErrorMessage("Enter your email first, then try forgot password again.");
      setInfoMessage(null);
      return;
    }

    setBusyAction("login");
    setErrorMessage(null);

    try {
      await forgotPasswordWithBackend(credentials.email.trim());
      setInfoMessage("Password reset instructions were sent if the account exists.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start password reset.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSocialLogin(provider: Exclude<AuthProvider, "local">) {
    if (!deviceId) {
      return;
    }

    setBusyAction(provider);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const result = await signInWithSocialProvider(provider);

      await finalizeSession(
        createBackendAuthenticatedSession(result.user, result.sessionToken, deviceId),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `${provider} sign-in failed.`);
    } finally {
      setBusyAction(null);
    }
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
        label="Email"
        onChangeText={(email) => updateSessionCredentials({ email })}
        onSubmitEditing={() => passwordInputRef.current?.focus()}
        placeholder="you@example.com"
        returnKeyType="next"
        value={credentials.email}
      />

      <Text style={styles.passwordLabel}>Password</Text>
      <View style={styles.passwordRow}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(password) => updateSessionCredentials({ password })}
          onSubmitEditing={() => passwordInputRef.current?.blur()}
          placeholder="password"
          placeholderTextColor="#8c9a86"
          ref={passwordInputRef}
          returnKeyType="done"
          secureTextEntry={!passwordVisible}
          style={styles.passwordInput}
          submitBehavior="submit"
          value={credentials.password}
        />
        <Pressable onPress={() => setPasswordVisible((current) => !current)} style={styles.passwordToggle}>
          <MaterialIcons
            color="#2f5d39"
            name={passwordVisible ? "visibility-off" : "visibility"}
            size={20}
          />
        </Pressable>
      </View>

      <PrimaryButton
        disabled={busyAction !== null || credentials.email.trim().length === 0 || credentials.password.length === 0}
        onPress={() => void handleLogin()}
      >
        {busyAction === "login" ? "Signing In..." : "Login"}
      </PrimaryButton>

      {credentials.password.length > 0 && credentials.password.length < 8 ? (
        <Text style={styles.validationText}>Password must be at least 8 characters.</Text>
      ) : null}

      <View style={styles.linkRow}>
        <Pressable onPress={() => router.push("/register")}>
          <Text style={styles.linkText}>Create account</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/forgot-password")}>
          <Text style={styles.linkText}>Forgot password</Text>
        </Pressable>
      </View>

      <Text style={styles.orText}>or continue with</Text>

      <PrimaryButton
        disabled={busyAction !== null || !socialProviders.google}
        onPress={() => void handleSocialLogin("google")}
        variant="ghost"
      >
        Continue with Google
      </PrimaryButton>
      <PrimaryButton
        disabled={busyAction !== null || !socialProviders.apple}
        onPress={() => void handleSocialLogin("apple")}
        variant="ghost"
      >
        Continue with Apple
      </PrimaryButton>
      <PrimaryButton
        disabled={busyAction !== null || !socialProviders.facebook}
        onPress={() => void handleSocialLogin("facebook")}
        variant="ghost"
      >
        Continue with Facebook
      </PrimaryButton>

      <PrimaryButton
        disabled={busyAction !== null}
        onPress={handlePromptEnterDemo}
        variant="secondary"
      >
        {busyAction === "demo" ? "Opening Demo..." : "Enter Demo"}
      </PrimaryButton>

      <Pressable disabled={busyAction !== null} onPress={() => void handleForgotPasswordInline()}>
        <Text style={styles.inlineHint}>Need a quick reset link? Send it to this email.</Text>
      </Pressable>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}
      <Text style={styles.demoHint}>
        Demo mode stays local on this device and will not sync or share routes.
      </Text>
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
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 12,
  },
  passwordLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#7b8a75",
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d7ddcf",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    marginBottom: 6,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#243224",
  },
  passwordToggle: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkText: {
    color: "#2f5d39",
    fontSize: 14,
    fontWeight: "600",
  },
  orText: {
    marginTop: 4,
    marginBottom: 8,
    color: "#71806e",
    textAlign: "center",
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  inlineHint: {
    marginTop: 6,
    textAlign: "center",
    color: "#5a6d57",
    fontSize: 13,
  },
  validationText: {
    marginTop: 8,
    color: "#7a6750",
    fontSize: 13,
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
    fontWeight: "600",
  },
  demoHint: {
    marginTop: 12,
    color: "#667862",
    fontSize: 13,
    lineHeight: 18,
  },
});
