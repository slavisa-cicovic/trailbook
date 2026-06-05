import generatedJournal from "../../../drizzle/meta/_journal.json";

type DrizzleMigrationConfig = {
  journal: {
    entries: {
      breakpoints: boolean;
      idx: number;
      tag: string;
      version: string;
      when: number;
    }[];
  };
  migrations: Record<string, string>;
};

export const DRIZZLE_BASELINE_TAG = "0000_baseline_current_legacy_schema";

export const drizzleMigrationConfig = {
  journal: generatedJournal,
  migrations: {
    // Baseline SQL is intentionally not bundled because legacy migrations own the current schema.
    m0000: "SELECT 1;",
  },
} satisfies DrizzleMigrationConfig;

const baselineEntry = drizzleMigrationConfig.journal.entries.find(
  (entry) => entry.tag === DRIZZLE_BASELINE_TAG,
);

if (!baselineEntry) {
  throw new Error(`Drizzle baseline migration "${DRIZZLE_BASELINE_TAG}" is missing.`);
}

export const DRIZZLE_BASELINE_WHEN = baselineEntry.when;
