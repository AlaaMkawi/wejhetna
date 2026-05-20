import { InteractionManager, Platform } from "react-native";

export type IosMapTeardownMode = "navigate" | "mutate";

const IOS_NAV_TEARDOWN_MS = 220;
/** Extra settle time after Home map shell is removed before pushing RouteDetails. */
const IOS_HOME_ROUTE_ENTRY_MS = 320;

/**
 * On iOS Fabric + MapLibre, navigating away while PointAnnotations / ShapeSources
 * are still mounted recycles native views that MapLibre still owns.
 * Wait until overlays are unmounted and one frame has painted before stack changes.
 */
export function runAfterIosMapTeardown(
  onComplete: () => void,
  mode: IosMapTeardownMode = "mutate"
): () => void {
  if (Platform.OS !== "ios") {
    onComplete();
    return () => {};
  }

  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const task = InteractionManager.runAfterInteractions(() => {
    if (cancelled) return;
    requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (mode === "navigate") {
          timeoutId = setTimeout(() => {
            if (!cancelled) {
              onComplete();
            }
          }, IOS_NAV_TEARDOWN_MS);
          return;
        }
        onComplete();
      });
    });
  });

  return () => {
    cancelled = true;
    task.cancel();
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
  };
}

/** After Home map children/shell are removed, wait before RouteDetails push (iOS only). */
export function waitForIosHomeMapBeforeRouteDetails(): Promise<void> {
  if (Platform.OS !== "ios") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, IOS_HOME_ROUTE_ENTRY_MS);
      });
    });
  });
}
