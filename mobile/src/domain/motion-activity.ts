export type MotionActivityType = "walk" | "bike" | "drive" | "stationary" | "unknown";
export type MotionActivityConfidence = "low" | "medium" | "high";
export type MotionActivitySourcePlatform = "android" | "ios";

export interface MotionActivity {
  type: MotionActivityType;
  confidence: MotionActivityConfidence;
  recordedAt: string;
  sourcePlatform: MotionActivitySourcePlatform;
}

export function normalizeMotionActivityType(value: unknown): MotionActivityType {
  switch (value) {
    case "walk":
    case "bike":
    case "drive":
    case "stationary":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}

export function normalizeMotionActivityConfidence(value: unknown): MotionActivityConfidence {
  switch (value) {
    case "low":
    case "medium":
    case "high":
      return value;
    default:
      return "low";
  }
}

export function normalizeMotionActivitySourcePlatform(
  value: unknown,
): MotionActivitySourcePlatform | null {
  switch (value) {
    case "android":
    case "ios":
      return value;
    default:
      return null;
  }
}

export function normalizeMotionActivity(value: unknown): MotionActivity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<MotionActivity>;
  const sourcePlatform = normalizeMotionActivitySourcePlatform(candidate.sourcePlatform);

  if (!candidate.recordedAt || typeof candidate.recordedAt !== "string" || sourcePlatform === null) {
    return null;
  }

  if (Number.isNaN(new Date(candidate.recordedAt).getTime())) {
    return null;
  }

  return {
    type: normalizeMotionActivityType(candidate.type),
    confidence: normalizeMotionActivityConfidence(candidate.confidence),
    recordedAt: candidate.recordedAt,
    sourcePlatform,
  };
}
