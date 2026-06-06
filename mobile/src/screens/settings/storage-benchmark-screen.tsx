import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View, useColorScheme } from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
import LoadingButton from "../../components/ui/loading-button";
import { getAppTheme, resolveAppThemeMode } from "../../constants/app-theme";
import { useFeatureFlags } from "../../core/hooks/use-feature-flags";
import { runStorageBenchmark } from "../../services/storage-benchmark/storage-benchmark-runner";
import type {
  StorageBenchmarkReport,
  StorageBenchmarkResult,
} from "../../services/storage-benchmark/storage-benchmark.types";
import { useSessionStore } from "../../state/session-store";
import { useThemeStore } from "../../state/theme-store";

function formatMs(value: number): string {
  if (value < 10) {
    return `${value.toFixed(2)}ms`;
  }

  if (value < 100) {
    return `${value.toFixed(1)}ms`;
  }

  return `${Math.round(value)}ms`;
}

function formatOperation(result: StorageBenchmarkResult): string {
  return `${result.group} / ${result.operation} / ${result.implementation}`;
}

function formatRecommendation(report: StorageBenchmarkReport): string {
  if (report.recommendation === "migrate") {
    return "Recommendation: Drizzle is within threshold for this run.";
  }

  if (report.recommendation === "partial-migration") {
    return "Recommendation: consider read migration only; writes need more profiling.";
  }

  return "Recommendation: keep raw SQL for this hot path for now.";
}

export default function StorageBenchmarkScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);
  const { testSettingsEnabled } = useFeatureFlags();
  const themeMode = useThemeStore((state) => state.mode);
  const systemColorScheme = useColorScheme();
  const theme = getAppTheme(resolveAppThemeMode(themeMode, systemColorScheme));
  const [busyRowCount, setBusyRowCount] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [report, setReport] = useState<StorageBenchmarkReport | null>(null);

  async function handleRun(rowCount: number) {
    setBusyRowCount(rowCount);
    setMessage(null);

    try {
      const nextReport = await runStorageBenchmark({ rowCount, runCount: 3 });

      setReport(nextReport);
      setMessage(formatRecommendation(nextReport));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Storage benchmark failed.");
    } finally {
      setBusyRowCount(null);
    }
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (!testSettingsEnabled) {
    return <Redirect href="/settings" />;
  }

  return (
    <ScreenLayout
      contentVariant="plain"
      onBack={() => router.back()}
      showBottomNavigation
      title="Storage benchmark"
    >
      <View style={styles.root}>
        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.primaryText }]}>
            Raw SQL vs Drizzle hot-path benchmark
          </Text>
          <Text style={[styles.description, { color: theme.mutedText }]}>
            Debug-only tool. It creates synthetic storage-benchmark rows, measures trip point and raw event operations, then deletes the synthetic data.
          </Text>
        </View>

        <View style={styles.actions}>
          <LoadingButton
            loading={busyRowCount === 100}
            loadingLabel="Running 100..."
            onPress={() => void handleRun(100)}
            variant="secondary"
          >
            Run 100 rows
          </LoadingButton>
          <LoadingButton
            loading={busyRowCount === 500}
            loadingLabel="Running 500..."
            onPress={() => void handleRun(500)}
          >
            Run 500 rows
          </LoadingButton>
        </View>

        {message ? (
          <Text style={[styles.message, { color: theme.mutedText }]}>{message}</Text>
        ) : null}

        {report ? (
          <View style={styles.results}>
            <Text style={[styles.sectionTitle, { color: theme.mutedText }]}>
              {report.rowCount} rows, {report.runCount} runs, {new Date(report.generatedAt).toLocaleString()}
            </Text>
            {report.results.map((result) => (
              <View
                key={`${result.group}-${result.operation}-${result.implementation}`}
                style={[styles.resultRow, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <Text style={[styles.resultTitle, { color: theme.primaryText }]}>
                  {formatOperation(result)}
                </Text>
                <Text style={[styles.resultDescription, { color: theme.mutedText }]}>
                  median {formatMs(result.medianMs)} | p95 {formatMs(result.p95Ms)} | min {formatMs(result.minMs)} | max {formatMs(result.maxMs)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.description, { color: theme.mutedText }]}>
            Run this on a physical Android release or preview build before using the result for migration decisions.
          </Text>
        )}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  infoCard: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 10,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  results: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  resultRow: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  resultDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
});
