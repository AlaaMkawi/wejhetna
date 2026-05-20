import { Platform } from "react-native";

const LOG_PREFIX = "[MapNav][RouteDetails]";

export function logRouteDetailsMapExit(
  step: string,
  extra?: Record<string, unknown>
): void {
  if (Platform.OS === "ios" || __DEV__) {
    if (extra) {
      console.log(LOG_PREFIX, step, extra);
    } else {
      console.log(LOG_PREFIX, step);
    }
  }
}

export type RunIosRouteDetailsResetExitParams = {
  /** e.g. "backToMap" | "stopNavigation" */
  logKey: string;
  /** Reset stack to Home — no manual MapLibre unmount before this. */
  resetToHome: () => void | Promise<void>;
};

/** 500–800ms settle before navigation reset (GPS/modals stopped, map tree untouched). */
const IOS_RESET_DELAY_MS = 650;

/**
 * iOS RouteDetails exit: stop side effects, wait, reset to Home.
 * Do not call setScreenMapActive(false), setMapLayersMounted(false), or hideOverlays on iOS.
 */
export function runIosRouteDetailsResetExit({
  logKey,
  resetToHome,
}: RunIosRouteDetailsResetExitParams): void {
  if (Platform.OS !== "ios") {
    return;
  }

  const run = async () => {
    logRouteDetailsMapExit(`${logKey}:iosNoManualUnmount`);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, IOS_RESET_DELAY_MS);
    });
    logRouteDetailsMapExit(`${logKey}:resetToHome`);
    await resetToHome();
  };

  void run();
}
