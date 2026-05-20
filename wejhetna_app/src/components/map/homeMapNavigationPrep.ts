import { Platform } from "react-native";

export type HomeMapNavigationPrep = {
  /** Sync: hide overlays, dismiss sheets, unmount Home MapView before stack push. */
  prepareLeaveForRoute: () => void;
};

let activePrep: HomeMapNavigationPrep | null = null;

export function registerHomeMapNavigationPrep(prep: HomeMapNavigationPrep): void {
  activePrep = prep;
}

export function unregisterHomeMapNavigationPrep(): void {
  activePrep = null;
}

export function invokeHomeMapNavigationPrep(): void {
  if (Platform.OS !== "ios") {
    return;
  }
  activePrep?.prepareLeaveForRoute();
}
