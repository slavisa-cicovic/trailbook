import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'trailbook.pendingAppleTransactions.v1';
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

export interface PendingAppleTransaction {
  appAccountToken: string | null;
  attemptCount: number;
  createdAt: string;
  lastError: string | null;
  nextAttemptAt: string | null;
  productId: string;
  retryable: boolean;
  transactionId: string;
  updatedAt: string;
  userId: string;
}

let mutationQueue = Promise.resolve();

export async function listPendingAppleTransactions() {
  await mutationQueue;
  return readPendingTransactions();
}

export function savePendingAppleTransaction(input: {
  appAccountToken?: string | null;
  productId: string;
  transactionId: string;
  userId: string;
}) {
  return mutatePendingTransactions((transactions) => {
    const now = new Date().toISOString();
    const existing = transactions.find(
      (transaction) => transaction.transactionId === input.transactionId,
    );
    if (existing) {
      existing.appAccountToken =
        input.appAccountToken ?? existing.appAccountToken;
      existing.productId = input.productId;
      existing.updatedAt = now;
      return transactions;
    }

    transactions.push({
      appAccountToken: input.appAccountToken ?? null,
      attemptCount: 0,
      createdAt: now,
      lastError: null,
      nextAttemptAt: null,
      productId: input.productId,
      retryable: true,
      transactionId: input.transactionId,
      updatedAt: now,
      userId: input.userId,
    });
    return transactions;
  });
}

export function recordPendingAppleTransactionFailure(
  transactionId: string,
  error: string,
  retryable: boolean,
) {
  return mutatePendingTransactions((transactions) => {
    const transaction = transactions.find(
      (candidate) => candidate.transactionId === transactionId,
    );
    if (!transaction) return transactions;

    transaction.attemptCount += 1;
    transaction.lastError = error;
    transaction.retryable = retryable;
    transaction.updatedAt = new Date().toISOString();
    transaction.nextAttemptAt = retryable
      ? new Date(
          Date.now() + retryDelayMs(transaction.attemptCount),
        ).toISOString()
      : null;
    return transactions;
  });
}

export function removePendingAppleTransaction(transactionId: string) {
  return mutatePendingTransactions((transactions) =>
    transactions.filter(
      (transaction) => transaction.transactionId !== transactionId,
    ),
  );
}

export function removeStalePendingAppleTransactions(
  userId: string,
  appleTransactionIds: Set<string>,
) {
  return mutatePendingTransactions((transactions) =>
    transactions.filter(
      (transaction) =>
        transaction.userId !== userId ||
        appleTransactionIds.has(transaction.transactionId),
    ),
  );
}

export function removePendingAppleTransactionsForUser(userId: string) {
  return mutatePendingTransactions((transactions) =>
    transactions.filter((transaction) => transaction.userId !== userId),
  );
}

export function retryDelayMs(attemptCount: number) {
  const index = Math.max(
    0,
    Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1),
  );
  return RETRY_DELAYS_MS[index];
}

async function mutatePendingTransactions(
  mutation: (
    transactions: PendingAppleTransaction[],
  ) => PendingAppleTransaction[],
) {
  let result: PendingAppleTransaction[] = [];
  const operation = mutationQueue.then(async () => {
    result = mutation(await readPendingTransactions());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  });
  mutationQueue = operation.catch(() => undefined);
  await operation;
  return result;
}

async function readPendingTransactions(): Promise<PendingAppleTransaction[]> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPendingAppleTransaction);
  } catch {
    return [];
  }
}

function isPendingAppleTransaction(
  value: unknown,
): value is PendingAppleTransaction {
  if (!value || typeof value !== 'object') return false;
  const transaction = value as Partial<PendingAppleTransaction>;
  return (
    typeof transaction.attemptCount === 'number' &&
    typeof transaction.createdAt === 'string' &&
    typeof transaction.productId === 'string' &&
    typeof transaction.retryable === 'boolean' &&
    typeof transaction.transactionId === 'string' &&
    typeof transaction.updatedAt === 'string' &&
    typeof transaction.userId === 'string'
  );
}
