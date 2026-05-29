// Sentry infrastructure — wired but inactive until @sentry/react-native is installed.
//
// To activate:
//   1. npm install @sentry/react-native
//   2. Run pod install (iOS) and sync gradle (Android)
//   3. Set EXPO_PUBLIC_SENTRY_DSN in your .env file
//   4. Uncomment the Sentry calls below

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): void {
  if (!DSN) {
    return;
  }

  // Sentry.init({
  //   dsn: DSN,
  //   tracesSampleRate: 0.2,
  //   environment: __DEV__ ? "development" : "production",
  // });
}

export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!DSN) {
    return;
  }

  // Sentry.captureException(error, { extra: context });
  void context;
}
