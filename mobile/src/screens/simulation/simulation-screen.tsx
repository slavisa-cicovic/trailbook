import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";

import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import ScreenLayout from "../../components/layout/screen-layout";
import { useRecordingStore } from "../../state/recording-store";
import { useThemeStore } from "../../state/theme-store";
import {
  getScenarioSummary,
  PREDEFINED_SCENARIOS,
  runScenario,
  startSimulationRecording,
  stopSimulationRecording,
  type PredefinedScenario,
  type ScenarioRunResult,
} from "../../services/simulation/scenario-runner.service";

interface ScenarioCardProps {
  scenario: PredefinedScenario;
  onRun: () => void;
  running: boolean;
  result: ScenarioRunResult | null;
  error: string | null;
  theme: ReturnType<typeof getAppTheme>;
}

function ScenarioCard({ scenario, onRun, running, result, error, theme }: ScenarioCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardName, { color: theme.primaryText }]}>{scenario.name}</Text>
          <Pressable
            disabled={running}
            onPress={onRun}
            style={({ pressed }) => [
              styles.runButton,
              { backgroundColor: theme.accent },
              (pressed || running) && styles.runButtonPressed,
            ]}
          >
            {running ? (
              <ActivityIndicator color={theme.surface} size="small" />
            ) : (
              <MaterialIcons color={theme.surface} name="play-arrow" size={18} />
            )}
            <Text style={[styles.runButtonText, { color: theme.surface }]}>
              {running ? "Running..." : "Run"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.cardSummary, { color: theme.accent }]}>
            {getScenarioSummary(scenario)}
          </Text>
          <View style={[styles.strategyBadge, { backgroundColor: theme.accentMuted }]}>
            <Text style={[styles.strategyBadgeText, { color: theme.accent }]}>
              {scenario.strategy}
            </Text>
          </View>
        </View>
        <Text style={[styles.cardDescription, { color: theme.mutedText }]}>
          {scenario.description}
        </Text>
      </View>

      {!running && result !== null && (
        <View style={[styles.resultRow, { borderTopColor: theme.border }]}>
          <MaterialIcons
            color={result.savedPoints > 0 ? theme.accent : theme.danger}
            name={result.savedPoints > 0 ? "check-circle" : "warning"}
            size={16}
          />
          <Text style={[styles.resultText, { color: result.savedPoints > 0 ? theme.accent : theme.danger }]}>
            {result.savedPoints > 0
              ? `${result.savedPoints} points saved (${result.locationCount} injected, ${result.processingMs}ms)`
              : `0 points saved — was recording active? (${result.locationCount} injected)`}
          </Text>
        </View>
      )}

      {!running && error !== null && (
        <View style={[styles.resultRow, { borderTopColor: theme.border }]}>
          <MaterialIcons color={theme.danger} name="error-outline" size={16} />
          <Text style={[styles.resultText, { color: theme.danger }]}>{error}</Text>
        </View>
      )}
    </View>
  );
}

export default function SimulationScreen() {
  const router = useRouter();
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const resolvedThemeMode = resolveAppThemeMode(themeMode, systemColorScheme);
  const theme = getAppTheme(resolvedThemeMode);
  const recordingStatus = useRecordingStore((state) => state.session.status);
  const recordingMode = useRecordingStore((state) => state.session.recordingMode);

  const [runningId, setRunningId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ScenarioRunResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [simRecordingBusy, setSimRecordingBusy] = useState(false);
  const [simRecordingError, setSimRecordingError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isRecording = recordingStatus === "recording";
  const isAutoMode = recordingMode === "auto";

  async function handleRun(scenario: PredefinedScenario) {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setRunningId(scenario.id);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[scenario.id];
      return next;
    });
    setResults((prev) => {
      const next = { ...prev };
      delete next[scenario.id];
      return next;
    });

    try {
      const result = await runScenario(scenario, () => undefined, controller.signal);
      setResults((prev) => ({ ...prev, [scenario.id]: result }));
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        [scenario.id]: error instanceof Error ? error.message : "Unknown error",
      }));
    } finally {
      setRunningId(null);
      abortControllerRef.current = null;
    }
  }

  async function handleStartSimRecording() {
    setSimRecordingBusy(true);
    setSimRecordingError(null);

    try {
      await startSimulationRecording();
    } catch (error) {
      setSimRecordingError(error instanceof Error ? error.message : "Failed to start.");
    } finally {
      setSimRecordingBusy(false);
    }
  }

  async function handleStopSimRecording() {
    setSimRecordingBusy(true);

    try {
      await stopSimulationRecording();
    } finally {
      setSimRecordingBusy(false);
    }
  }

  return (
    <ScreenLayout
      contentVariant="plain"
      onBack={() => router.back()}
      scrollEnabled={false}
      title="GPS Simulation"
    >
      <View style={styles.root}>
        <View style={styles.fixedHeader}>
          <View style={[styles.banner, { backgroundColor: theme.accentMuted, borderColor: theme.border }]}>
            <MaterialIcons color={theme.accent} name="science" size={20} />
            <Text style={[styles.bannerText, { color: theme.accent }]}>
              Dev tool — injects synthetic GPS data into the recording pipeline.
            </Text>
          </View>

          <View style={[styles.recordingControl, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.recordingStatusRow}>
              <View style={[styles.statusDot, { backgroundColor: isRecording ? theme.accent : theme.mutedText }]} />
              <Text style={[styles.recordingStatusText, { color: theme.primaryText }]}>
                {isRecording ? "Recording active" : "No active recording"}
              </Text>
            </View>

            {isRecording ? (
              <Pressable
                disabled={simRecordingBusy}
                onPress={() => void handleStopSimRecording()}
                style={({ pressed }) => [
                  styles.controlButton,
                  { backgroundColor: theme.danger },
                  (pressed || simRecordingBusy) && styles.runButtonPressed,
                ]}
              >
                <MaterialIcons color={theme.surface} name="stop" size={16} />
                <Text style={[styles.controlButtonText, { color: theme.surface }]}>Stop recording</Text>
              </Pressable>
            ) : (
              <Pressable
                disabled={simRecordingBusy}
                onPress={() => void handleStartSimRecording()}
                style={({ pressed }) => [
                  styles.controlButton,
                  { backgroundColor: theme.accent },
                  (pressed || simRecordingBusy) && styles.runButtonPressed,
                ]}
              >
                {simRecordingBusy ? (
                  <ActivityIndicator color={theme.surface} size="small" />
                ) : (
                  <MaterialIcons color={theme.surface} name="radio-button-on" size={16} />
                )}
                <Text style={[styles.controlButtonText, { color: theme.surface }]}>
                  Start sim recording
                </Text>
              </Pressable>
            )}

            {simRecordingError !== null && (
              <Text style={[styles.errorText, { color: theme.danger }]}>{simRecordingError}</Text>
            )}

            {isRecording && !isAutoMode && (
              <Text style={[styles.errorText, { color: theme.danger }]}>
                Not in AUTO mode — profile transitions won't be detected.
              </Text>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scenarioList}
          keyboardShouldPersistTaps="handled"
          style={styles.scenarioScroll}
        >
          {PREDEFINED_SCENARIOS.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              error={errors[scenario.id] ?? null}
              onRun={() => void handleRun(scenario)}
              result={results[scenario.id] ?? null}
              running={runningId === scenario.id}
              scenario={scenario}
              theme={theme}
            />
          ))}
        </ScrollView>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fixedHeader: { gap: 12 },
  scenarioScroll: { flex: 1 },
  scenarioList: { gap: 12, paddingBottom: 16, paddingTop: 12 },
  banner: {
    alignItems: "flex-start",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  recordingControl: { borderRadius: 18, borderWidth: 1, gap: 10, padding: 16 },
  recordingStatusRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  statusDot: { borderRadius: 5, height: 10, width: 10 },
  recordingStatusText: { flex: 1, fontSize: 14, fontWeight: "700" },
  controlButton: {
    alignItems: "center",
    borderRadius: 12,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  controlButtonText: { fontSize: 14, fontWeight: "800" },
  errorText: { fontSize: 13, lineHeight: 18 },
  card: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  cardHeader: { gap: 6, padding: 16 },
  cardTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  cardName: { flex: 1, fontSize: 16, fontWeight: "800" },
  summaryRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  cardSummary: { flex: 1, fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  strategyBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  strategyBadgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  cardDescription: { fontSize: 13, lineHeight: 18 },
  runButton: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 4,
    minWidth: 80,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  runButtonPressed: { opacity: 0.72 },
  runButtonText: { fontSize: 13, fontWeight: "800" },
  resultRow: {
    alignItems: "center",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resultText: { fontSize: 13, fontWeight: "600", flex: 1 },
});
