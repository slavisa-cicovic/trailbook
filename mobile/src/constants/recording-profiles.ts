import type { RecordingProfile } from "../domain/trips";

export interface RecordingProfileOption {
  description: string;
  hint: string;
  label: string;
  value: RecordingProfile;
}

export const DEFAULT_RECORDING_PROFILE: RecordingProfile = "auto";

export const RECORDING_PROFILE_OPTIONS: RecordingProfileOption[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Recommended",
    hint: "Balanced route detail and battery use.",
  },
  {
    value: "walk_relaxed",
    label: "Walk / relaxed",
    description: "Lower battery use",
    hint: "Good for long relaxed walks and coarse traces.",
  },
  {
    value: "city_walk",
    label: "City walk",
    description: "More route detail",
    hint: "Better for turns and shorter street segments.",
  },
  {
    value: "drive_city",
    label: "Drive / city",
    description: "Urban driving",
    hint: "Good for city traffic, turns, and frequent street changes.",
  },
  {
    value: "drive_highway",
    label: "Drive / highway",
    description: "Longer road segments",
    hint: "Better for faster travel with fewer direction changes.",
  },
  {
    value: "frequent",
    label: "Frequent",
    description: "Higher battery use",
    hint: "Most detailed trace of all available modes.",
  },
];

export function getRecordingProfileLabel(profile: RecordingProfile): string {
  return (
    RECORDING_PROFILE_OPTIONS.find((option) => option.value === profile)?.label ??
    RECORDING_PROFILE_OPTIONS[0].label
  );
}
