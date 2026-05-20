import { useCallback, useState } from "react";
import { Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useIosAnnotationMount } from "./useIosAnnotationMount";
import { suppressMapOverlays, releaseMapOverlays } from "./mapOverlayStore";
import { runAfterIosMapTeardown } from "../../utils/iosMapScreenTeardown";

/**
 * Gates MapLibre overlays (annotations, shape layers) and defers navigation until
 * overlays are removed on iOS. Android navigates immediately (unchanged behavior).
 */
export function useMapScreenOverlays() {
  const iosAnnotationsReady = useIosAnnotationMount();
  const [overlaysEnabled, setOverlaysEnabled] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setOverlaysEnabled(true);
      if (Platform.OS === "ios") {
        // Defer until the previous screen's MapView has unmounted (e.g. RouteDetails → Home).
        runAfterIosMapTeardown(() => releaseMapOverlays(), "navigate");
      } else {
        releaseMapOverlays();
      }
      return () => {
        if (Platform.OS === "ios") {
          suppressMapOverlays();
        }
      };
    }, [])
  );

  const showOverlays = overlaysEnabled && iosAnnotationsReady;

  const hideOverlays = useCallback(() => {
    setOverlaysEnabled(false);
    if (Platform.OS === "ios") {
      suppressMapOverlays();
    }
  }, []);

  const exitMapScreen = useCallback((action: () => void) => {
    hideOverlays();
    runAfterIosMapTeardown(action, "navigate");
  }, [hideOverlays]);

  /** Briefly hide overlays for in-screen map mutations (camera / mode toggles). */
  const withOverlayPause = useCallback((action: () => void) => {
    if (Platform.OS !== "ios") {
      action();
      return;
    }
    hideOverlays();
    runAfterIosMapTeardown(() => {
      action();
      setOverlaysEnabled(true);
      releaseMapOverlays();
    }, "mutate");
  }, [hideOverlays]);

  return {
    showOverlays,
    hideOverlays,
    exitMapScreen,
    withOverlayPause,
    overlaysEnabled,
  };
}
