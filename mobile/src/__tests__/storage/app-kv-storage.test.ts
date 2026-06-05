import { beforeEach, describe, expect, it, vi } from "vitest";

const records = new Map<string, { jsonValue: string; updatedAt: string }>();

vi.mock("drizzle-orm", () => ({
  eq: (_column: unknown, value: string) => ({ value }),
}));

vi.mock("../../storage/drizzle/db", () => ({
  getDrizzleDatabase: async () => createFakeDatabase(),
  runExclusiveDrizzleWrite: async <T>(task: (database: ReturnType<typeof createFakeDatabase>) => Promise<T>) =>
    task(createFakeDatabase()),
}));

function createFakeDatabase() {
  return {
    delete: () => ({
      where: async (condition: { value: string }) => {
        records.delete(condition.value);
      },
    }),
    insert: () => ({
      values: (row: { jsonValue: string; storageKey: string; updatedAt: string }) => ({
        onConflictDoUpdate: async ({ set }: { set: { jsonValue: string; updatedAt: string } }) => {
          records.set(row.storageKey, {
            jsonValue: set.jsonValue,
            updatedAt: set.updatedAt,
          });
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: (condition: { value: string }) => ({
          limit: async () => {
            const row = records.get(condition.value);
            return row ? [{ jsonValue: row.jsonValue }] : [];
          },
        }),
      }),
    }),
  };
}

describe("app-kv-storage", () => {
  beforeEach(() => {
    records.clear();
  });

  it("returns null when key is missing", async () => {
    const { loadJsonRecord } = await import("../../storage/app-kv-storage");

    await expect(loadJsonRecord("missing")).resolves.toBeNull();
  });

  it("saves and loads JSON object values", async () => {
    const { loadJsonRecord, saveJsonRecord } = await import("../../storage/app-kv-storage");

    await saveJsonRecord("settings", { enabled: true, count: 3 });

    await expect(loadJsonRecord("settings")).resolves.toEqual({ enabled: true, count: 3 });
  });

  it("saves and loads primitive JSON values", async () => {
    const { loadJsonRecord, saveJsonRecord } = await import("../../storage/app-kv-storage");

    await saveJsonRecord("theme", "auto");

    await expect(loadJsonRecord("theme")).resolves.toBe("auto");
  });

  it("updates existing values", async () => {
    const { loadJsonRecord, saveJsonRecord } = await import("../../storage/app-kv-storage");

    await saveJsonRecord("recording", { status: "idle" });
    await saveJsonRecord("recording", { status: "recording" });

    await expect(loadJsonRecord("recording")).resolves.toEqual({ status: "recording" });
  });

  it("deletes values when saving null", async () => {
    const { loadJsonRecord, saveJsonRecord } = await import("../../storage/app-kv-storage");

    await saveJsonRecord("recording", { status: "idle" });
    await saveJsonRecord("recording", null);

    await expect(loadJsonRecord("recording")).resolves.toBeNull();
  });
});
