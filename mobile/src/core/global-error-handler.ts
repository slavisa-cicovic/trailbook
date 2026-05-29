import { captureError } from "./sentry";

type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;

declare const ErrorUtils: {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
} | undefined;

function logError(error: Error, context: string, extra?: Record<string, unknown>) {
  console.error(`[Trailbook][${context}]`, error.message, extra ?? "");
  captureError(error, { context, ...extra });
}

export function setupGlobalErrorHandler(): void {
  if (typeof ErrorUtils !== "undefined") {
    const previousHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler((error, isFatal) => {
      logError(error, isFatal ? "fatal" : "uncaught");
      previousHandler?.(error, isFatal);
    });
  }

  const previousRejectionHandler = global.onunhandledrejection;

  global.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    logError(error, "unhandled-rejection");
    previousRejectionHandler?.(event);
  };
}
