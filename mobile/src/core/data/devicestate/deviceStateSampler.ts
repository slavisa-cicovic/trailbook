import * as Battery from 'expo-battery';
import type { RawDeviceSample } from '@/core/domain/model/rawSamples';

export async function sampleDeviceState(tripId: string): Promise<RawDeviceSample> {
  const [batteryLevel, batteryState] = await Promise.all([
    Battery.getBatteryLevelAsync(),
    Battery.getBatteryStateAsync(),
  ]);

  return {
    tripId,
    timestamp: new Date(),
    batteryPct: Math.round(batteryLevel * 100),
    isCharging: batteryState === Battery.BatteryState.CHARGING,
    powerSaveMode: false, // expo-battery has no power-save API on iOS
    gpsEnabled: true,     // if we're recording, GPS is on by definition
  };
}
