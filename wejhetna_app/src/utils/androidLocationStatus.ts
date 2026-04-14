import { Linking, NativeModules, Platform } from "react-native";

export type AndroidLocationStatus = {
  locationEnabled: boolean;
  gpsEnabled: boolean;
  networkEnabled: boolean;
  playServicesAvailable: boolean;
  playServicesStatus: number;
};

const { LocationStatus } = NativeModules as {
  LocationStatus?: { getStatus?: () => Promise<AndroidLocationStatus> };
};

export async function getAndroidLocationStatus(): Promise<AndroidLocationStatus | null> {
  if (Platform.OS !== "android") return null;
  const fn = LocationStatus?.getStatus;
  if (!fn) return null;
  return await fn();
}

export async function openAndroidLocationSettings(): Promise<void> {
  // opens OS settings page; may vary by device, but this is a good generic fallback
  await Linking.openSettings();
}

