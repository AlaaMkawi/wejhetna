import { DeviceEventEmitter } from "react-native";

/** Fired when driver toggles online/offline on DriverRequests tab (synced to Home map ride CTA). */
export const DRIVER_AVAILABILITY_CHANGED_EVENT = "wejhetna:DRIVER_AVAILABILITY_CHANGED";

let driverIsOnlineCached = false;

export function getDriverAvailabilityCached(): boolean {
  return driverIsOnlineCached;
}

export function setDriverAvailabilityCached(isAvailable: boolean): void {
  if (driverIsOnlineCached === isAvailable) return;
  driverIsOnlineCached = isAvailable;
  DeviceEventEmitter.emit(DRIVER_AVAILABILITY_CHANGED_EVENT, { isAvailable });
}
