import type { MaterialIcons } from "@expo/vector-icons";

import type { WaypointCategory } from "../domain/trips";

export interface WaypointCategoryOption {
  color: string;
  iconName: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: WaypointCategory;
}

export const DEFAULT_WAYPOINT_CATEGORY: WaypointCategory = "generic";

export const WAYPOINT_CATEGORY_OPTIONS: WaypointCategoryOption[] = [
  { value: "generic", label: "Note", iconName: "place", color: "#355035" },
  { value: "departure", label: "Departure", iconName: "home", color: "#4b6b4b" },
  { value: "fuel", label: "Fuel", iconName: "local-gas-station", color: "#b35f2f" },
  { value: "border", label: "Border", iconName: "flag", color: "#8a5c1d" },
  { value: "port", label: "Port", iconName: "anchor", color: "#2f6db3" },
  { value: "ferry", label: "Ferry", iconName: "directions-boat", color: "#2f7ea3" },
  { value: "restaurant", label: "Restaurant", iconName: "restaurant", color: "#9f5f0f" },
  { value: "cafe", label: "Cafe", iconName: "local-cafe", color: "#7b5238" },
  { value: "viewpoint", label: "Viewpoint", iconName: "landscape", color: "#2f7d4b" },
  { value: "monument", label: "Monument", iconName: "account-balance", color: "#6d5f8c" },
  { value: "beach", label: "Beach", iconName: "beach-access", color: "#2b8ea3" },
];

export function getWaypointCategoryOption(category: WaypointCategory): WaypointCategoryOption {
  return (
    WAYPOINT_CATEGORY_OPTIONS.find((option) => option.value === category) ??
    WAYPOINT_CATEGORY_OPTIONS[0]
  );
}

export function normalizeWaypointCategory(value: string | null | undefined): WaypointCategory {
  return (
    WAYPOINT_CATEGORY_OPTIONS.find((option) => option.value === value)?.value ??
    DEFAULT_WAYPOINT_CATEGORY
  );
}
