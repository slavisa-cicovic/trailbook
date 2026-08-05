import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { RawActivitySample } from '@/core/domain/model/rawSamples';

type MotionType = 'walk' | 'bike' | 'drive' | 'stationary' | 'unknown';
type MotionConfidence = 'low' | 'medium' | 'high';

type MotionActivity = {
  type: MotionType;
  confidence: MotionConfidence;
  recordedAt: string;
  sourcePlatform: 'android' | 'ios';
};

type MotionActivityModule = {
  getLatestActivityAsync(): Promise<unknown>;
  isAvailableAsync(): Promise<boolean>;
  startUpdatesAsync(): Promise<void>;
  stopUpdatesAsync(): Promise<void>;
};

const nativeModule = requireOptionalNativeModule<MotionActivityModule>('TrailbookMotionActivity');
const MAX_SAMPLE_AGE_MS = 30_000;

const ACTIVITY_TYPES: Record<MotionType, number> = {
  drive: 0,
  bike: 1,
  walk: 2,
  stationary: 3,
  unknown: 4,
};

const CONFIDENCE: Record<MotionConfidence, number> = {
  low: 25,
  medium: 60,
  high: 90,
};

function normalize(value: unknown): MotionActivity | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<MotionActivity>;
  if (!['walk', 'bike', 'drive', 'stationary', 'unknown'].includes(candidate.type ?? '')) return null;
  if (!['low', 'medium', 'high'].includes(candidate.confidence ?? '')) return null;
  if (!['android', 'ios'].includes(candidate.sourcePlatform ?? '')) return null;
  if (typeof candidate.recordedAt !== 'string') return null;
  if (Number.isNaN(new Date(candidate.recordedAt).getTime())) return null;
  return candidate as MotionActivity;
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 29) return true;
  const permission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission, {
    title: 'Activity recognition',
    message: 'Trailbook uses motion activity while recording to distinguish walking, cycling, and driving.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function startMotionActivityUpdates(): Promise<boolean> {
  if (!nativeModule) return false;
  try {
    if (!(await nativeModule.isAvailableAsync())) return false;
    if (!(await ensurePermission())) return false;
    await nativeModule.startUpdatesAsync();
    return true;
  } catch {
    return false;
  }
}

export async function stopMotionActivityUpdates(): Promise<void> {
  try {
    await nativeModule?.stopUpdatesAsync();
  } catch {
    // Motion sensing is an enhancement and must never prevent recording cleanup.
  }
}

export async function getMotionActivitySample(
  tripId: string,
  timestamp: Date,
): Promise<RawActivitySample | null> {
  if (!nativeModule) return null;
  try {
    const activity = normalize(await nativeModule.getLatestActivityAsync());
    if (!activity || activity.type === 'unknown') return null;
    const recordedAt = new Date(activity.recordedAt);
    if (Math.abs(timestamp.getTime() - recordedAt.getTime()) > MAX_SAMPLE_AGE_MS) return null;
    return {
      tripId,
      timestamp,
      results: [{
        activityType: ACTIVITY_TYPES[activity.type],
        confidence: CONFIDENCE[activity.confidence],
      }],
    };
  } catch {
    return null;
  }
}
