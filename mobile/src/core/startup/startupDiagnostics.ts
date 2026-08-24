import AsyncStorage from '@react-native-async-storage/async-storage';

export type StartupPhase =
  | 'database'
  | 'authentication'
  | 'preferences'
  | 'background_tasks'
  | 'recording_recovery';

export type StartupFailureCategory =
  | 'local_database'
  | 'secure_authentication'
  | 'local_preferences'
  | 'background_task_cleanup'
  | 'recording_recovery'
  | 'unexpected';

export interface StartupFailure {
  attempt: number;
  category: StartupFailureCategory;
  code: string;
  occurredAt: string;
  phase: StartupPhase | 'unknown';
}

const LAST_FAILURE_KEY = 'trailbook.startup_failure.v1';

const PHASE_DETAILS: Record<StartupPhase, { category: StartupFailureCategory; code: string }> = {
  database: { category: 'local_database', code: 'STARTUP-DB-01' },
  authentication: { category: 'secure_authentication', code: 'STARTUP-AUTH-01' },
  preferences: { category: 'local_preferences', code: 'STARTUP-PREFS-01' },
  background_tasks: { category: 'background_task_cleanup', code: 'STARTUP-TASKS-01' },
  recording_recovery: { category: 'recording_recovery', code: 'STARTUP-RECORDING-01' },
};

export class StartupPhaseError extends Error {
  constructor(
    readonly phase: StartupPhase,
    readonly cause: unknown,
  ) {
    super(`Startup phase failed: ${phase}`);
    this.name = 'StartupPhaseError';
  }
}

export async function runStartupPhase(
  phase: StartupPhase,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    throw new StartupPhaseError(phase, error);
  }
}

export function describeStartupFailure(error: unknown, attempt: number): StartupFailure {
  const occurredAt = new Date().toISOString();
  if (error instanceof StartupPhaseError) {
    const details = PHASE_DETAILS[error.phase];
    return { attempt, occurredAt, phase: error.phase, ...details };
  }
  return {
    attempt,
    category: 'unexpected',
    code: 'STARTUP-UNKNOWN-01',
    occurredAt,
    phase: 'unknown',
  };
}

export async function saveStartupFailure(failure: StartupFailure): Promise<void> {
  try {
    // Intentionally excludes exception messages, tokens, user data and trip data.
    await AsyncStorage.setItem(LAST_FAILURE_KEY, JSON.stringify(failure));
  } catch {
    // Diagnostics must never replace the original startup failure.
  }
}

export async function clearStartupFailure(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_FAILURE_KEY);
  } catch {
    // Startup success must not depend on diagnostics storage.
  }
}

export function startupFailureMessage(failure: StartupFailure): string {
  switch (failure.category) {
    case 'local_database':
      return 'Trailbook could not prepare its local database.';
    case 'secure_authentication':
      return 'Trailbook could not restore the saved sign-in session.';
    case 'local_preferences':
      return 'Trailbook could not load local preferences.';
    case 'background_task_cleanup':
      return 'Trailbook could not prepare background tasks.';
    case 'recording_recovery':
      return 'Trailbook found an active trip but could not safely resume location recording.';
    default:
      return 'Trailbook encountered an unexpected startup error.';
  }
}
