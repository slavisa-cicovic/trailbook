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
    // Baseline SQL is intentionally no-op: legacy PRAGMA user_version migrations
    // already create the current schema. Post-baseline Drizzle migrations may be
    // bundled here only when schema ownership is explicitly changed.
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
