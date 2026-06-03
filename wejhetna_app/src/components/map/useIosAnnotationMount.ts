import { useEffect, useState } from "react";
import { InteractionManager, Platform } from "react-native";
import { useMapAnnotationsReady } from "./mapReadyContext";
import {
  areMapOverlaysSuppressed,
  subscribeMapOverlaySuppress,
} from "./mapOverlayStore";

/**
 * On iOS Fabric, mounting many PointAnnotation children in the same frame as
 * MLNMapView initialization recycles native views that are still attached.
 * Waits for map ready, then one interaction frame before showing markers.
 */
export function useIosAnnotationMount(): boolean {
  const mapReady = useMapAnnotationsReady();
  const [canMount, setCanMount] = useState(Platform.OS !== "ios");
  const [suppressTick, setSuppressTick] = useState(0);

  useEffect(() => subscribeMapOverlaySuppress(() => setSuppressTick((n) => n + 1)), []);

  useEffect(() => {
    if (Platform.OS !== "ios") {
      setCanMount(mapReady);
      return;
    }
    if (!mapReady || areMapOverlaysSuppressed()) {
      setCanMount(false);
      return;
    }
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        setCanMount(true);
      }
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [mapReady, suppressTick]);

  if (Platform.OS !== "ios") {
    return mapReady;
  }
  return canMount && !areMapOverlaysSuppressed();
}
