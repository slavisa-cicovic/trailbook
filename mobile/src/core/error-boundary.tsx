import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { recordDiagnosticEvent } from "../services/diagnostics/diagnostic-events.service";
import { captureError } from "./sentry";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[Trailbook] Uncaught render error", error, info.componentStack);
    captureError(error, { componentStack: info.componentStack ?? undefined });
    void recordDiagnosticEvent({
      category: "app",
      name: "render_error",
      payload: {
        componentStack: info.componentStack ?? null,
        message: error.message,
        name: error.name,
      },
      severity: "error",
    });
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        {__DEV__ && (
          <Text style={styles.detail}>{this.state.error.message}</Text>
        )}
        <Pressable style={styles.button} onPress={this.handleRetry}>
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  detail: {
    color: "#aaa",
    fontSize: 13,
    textAlign: "center",
  },
  button: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    backgroundColor: "#333",
    borderRadius: 8,
  },
  buttonLabel: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "500",
  },
});
