import * as Battery from "expo-battery";

export type BatterySnapshotState = "charging" | "full" | "unplugged" | "unknown";

export interface BatterySnapshot {
  levelPercent: number | null;
  state: BatterySnapshotState;
}

function normalizeBatteryState(state: Battery.BatteryState): BatterySnapshotState {
  switch (state) {
    case Battery.BatteryState.CHARGING:
      return "charging";
    case Battery.BatteryState.FULL:
      return "full";
    case Battery.BatteryState.UNPLUGGED:
      return "unplugged";
    case Battery.BatteryState.UNKNOWN:
    default:
      return "unknown";
  }
}

export async function getBatterySnapshot(): Promise<BatterySnapshot> {
  try {
    const [level, state] = await Promise.all([
      Battery.getBatteryLevelAsync(),
      Battery.getBatteryStateAsync(),
    ]);

    return {
      levelPercent: Number.isFinite(level) && level >= 0 ? Math.round(level * 100) : null,
      state: normalizeBatteryState(state),
    };
  } catch {
    return {
      levelPercent: null,
      state: "unknown",
    };
  }
}
