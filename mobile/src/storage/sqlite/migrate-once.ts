import { loadJsonRecord, saveJsonRecord } from "./db";

const MIGRATIONS_KEY = "trailbook.migrations.v1";

const completed = new Set<string>();
const pending = new Map<string, Promise<void>>();

export async function migrateOnce(id: string, fn: () => Promise<void>): Promise<void> {
  if (completed.has(id)) {
    return;
  }

  const inflight = pending.get(id);

  if (inflight) {
    return inflight;
  }

  const task = (async () => {
    try {
      const record = await loadJsonRecord<string[]>(MIGRATIONS_KEY);
      const done = new Set(record ?? []);

      if (done.has(id)) {
        completed.add(id);
        return;
      }

      await fn();

      done.add(id);
      completed.add(id);
      await saveJsonRecord(MIGRATIONS_KEY, [...done]);
    } finally {
      pending.delete(id);
    }
  })();

  pending.set(id, task);
  return task;
}
