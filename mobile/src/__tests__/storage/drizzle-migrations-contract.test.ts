import { describe, expect, it } from "vitest";

import {
  DRIZZLE_BASELINE_TAG,
  DRIZZLE_BASELINE_WHEN,
  drizzleMigrationConfig,
} from "../../storage/drizzle/migrations";

describe("drizzle migration baseline contract", () => {
  it("derives the baseline timestamp from the generated journal", () => {
    const baselineEntry = drizzleMigrationConfig.journal.entries.find(
      (entry) => entry.tag === DRIZZLE_BASELINE_TAG,
    );

    expect(baselineEntry).toBeDefined();
    expect(DRIZZLE_BASELINE_WHEN).toBe(baselineEntry?.when);
  });

  it("keeps the legacy-owned baseline as a no-op migration", () => {
    expect(drizzleMigrationConfig.migrations).toEqual({
      m0000: "SELECT 1;",
    });
    expect(Object.values(drizzleMigrationConfig.migrations).join("\n")).not.toContain("CREATE TABLE");
  });
});
