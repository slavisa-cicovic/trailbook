import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "trailbook.mobile.device-id.v1";

export async function getOrCreateDeviceId(): Promise<string> {
  const existingDeviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);

  if (existingDeviceId) {
    return existingDeviceId;
  }

  const nextDeviceId = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, nextDeviceId);

  return nextDeviceId;
}
