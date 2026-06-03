import type { RecordingMode, RecordingProfile } from "../domain/trips";

export interface RecordingProfileOption {
  description: string;
  hint: string;
  label: string;
  value: RecordingMode;
}

export type LegacyRecordingProfile =
  | "auto"
  | "walk_relaxed"
  | "city_walk"
  | "drive_city"
  | "drive_highway"
  | "frequent";

export const DEFAULT_RECORDING_PROFILE: RecordingProfile = "walk";

export const RECORDING_PROFILE_OPTIONS: RecordingProfileOption[] = [
  {
    value: "auto",
    label: "Auto",
    description: "App decides",
    hint: "Trailbook infers segment modes and lets you correct them later if needed.",
  },
  {
    value: "walk",
    label: "Walk",
    description: "On foot",
    hint: "Best for walking tours, short turns, and exploring on foot.",
  },
  {
    value: "bike",
    label: "Bike",
    description: "Steady motion",
    hint: "Good for bike rides and medium-speed route detail.",
  },
  {
    value: "drive",
    label: "Drive",
    description: "Faster travel",
    hint: "Best for car trips and longer road segments.",
  },
  {
    value: "boat",
    label: "Boat",
    description: "Water travel",
    hint: "Best for ferries, boats, and slower trips on the water.",
  },
  {
    value: "plane",
    label: "Plane",
    description: "Air travel",
    hint: "Best for flights and long-distance air segments.",
  },
];

export const CONFIGURABLE_RECORDING_PROFILE_OPTIONS: (RecordingProfileOption & { value: RecordingProfile })[] = RECORDING_PROFILE_OPTIONS.filter(
  (option): option is RecordingProfileOption & { value: RecordingProfile } => option.value !== "auto",
);

export function normalizeRecordingProfile(
  profile: RecordingProfile | LegacyRecordingProfile | null | undefined,
): RecordingProfile {
  switch (profile) {
    case "walk":
    case "bike":
    case "drive":
    case "boat":
    case "plane":
      return profile;
    case "drive_city":
    case "drive_highway":
      return "drive";
    case "frequent":
      return "bike";
    case "auto":
    case "walk_relaxed":
    case "city_walk":
    default:
      return "walk";
  }
}

export function normalizeRecordingMode(
  mode: RecordingMode | LegacyRecordingProfile | null | undefined,
): RecordingMode {
  if (mode === "auto") {
    return "auto";
  }

  return normalizeRecordingProfile(mode);
}

export function getRecordingProfileLabel(profile: RecordingMode): string {
  return (
    RECORDING_PROFILE_OPTIONS.find((option) => option.value === profile)?.label ??
    RECORDING_PROFILE_OPTIONS[0].label
  );
}

export function getRecordingProfileColor(profile: RecordingProfile): string {
  switch (profile) {
    case "walk":
      return "#d4f542";
    case "bike":
      return "#2f6db3";
    case "drive":
      return "#d8751f";
    case "boat":
      return "#1f8aa5";
    case "plane":
      return "#7b5bd6";
    default:
      return "#355035";
  }
}
