import { Platform } from "react-native";
import { invokeHomeMapNavigationPrep } from "../components/map/homeMapNavigationPrep";
import { suppressMapOverlays } from "../components/map/mapOverlayStore";
import { runAfterIosMapTeardown, waitForIosHomeMapBeforeRouteDetails } from "./iosMapScreenTeardown";

/**
 * Run a navigation action after iOS map overlays are hidden and native views settle.
 * Home screens register via useHomeMapScreen to unmount MapView before RouteDetails push.
 * No-op delay path on Android.
 */
export type RunMapSafeNavigationOptions = {
  /** Home already ran prepareLeaveForRoute + entry delay via runOpenDrivingRoutePreviewFromHome. */
  skipHomePrep?: boolean;
};

export function runMapSafeNavigation(
  action: () => void,
  options?: RunMapSafeNavigationOptions
): void {
  if (Platform.OS === "ios" && !options?.skipHomePrep) {
    invokeHomeMapNavigationPrep();
    suppressMapOverlays();
  }
  runAfterIosMapTeardown(() => {
    void waitForIosHomeMapBeforeRouteDetails().then(action);
  }, "navigate");
}
