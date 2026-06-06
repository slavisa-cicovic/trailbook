export type StorageBenchmarkGroup = "raw-location-events" | "trip-points";
export type StorageBenchmarkImplementation = "raw-sql" | "drizzle";
export type StorageBenchmarkOperation = "insert" | "load-by-trip" | "replace-by-trip" | "update-processing";
export type StorageBenchmarkRecommendation = "migrate" | "partial-migration" | "keep-raw-sql";

export interface StorageBenchmarkRunOptions {
  rowCount?: number;
  runCount?: number;
}

export interface StorageBenchmarkResult {
  batchSize: number;
  durationsMs: number[];
  group: StorageBenchmarkGroup;
  implementation: StorageBenchmarkImplementation;
  maxMs: number;
  medianMs: number;
  minMs: number;
  operation: StorageBenchmarkOperation;
  p95Ms: number;
  rowCount: number;
  runCount: number;
}

export interface StorageBenchmarkReport {
  generatedAt: string;
  recommendation: StorageBenchmarkRecommendation;
  results: StorageBenchmarkResult[];
  rowCount: number;
  runCount: number;
  segmentLocalId: string;
  tripLocalId: string;
}
