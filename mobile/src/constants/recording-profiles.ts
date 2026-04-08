import type { RecordingProfile } from "../domain/trips";

export interface RecordingProfileOption {
  description: string;
  hint: string;
  label: string;
  value: RecordingProfile;
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
];

export function normalizeRecordingProfile(
  profile: RecordingProfile | LegacyRecordingProfile | null | undefined,
): RecordingProfile {
  switch (profile) {
    case "walk":
    case "bike":
    case "drive":
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

export function getRecordingProfileLabel(profile: RecordingProfile): string {
  return (
    RECORDING_PROFILE_OPTIONS.find((option) => option.value === profile)?.label ??
    RECORDING_PROFILE_OPTIONS[0].label
  );
}

export function getRecordingProfileColor(profile: RecordingProfile): string {
  switch (profile) {
    case "walk":
      return "#2f7d4b";
    case "bike":
      return "#2f6db3";
    case "drive":
      return "#d8751f";
    default:
      return "#355035";
  }
}
