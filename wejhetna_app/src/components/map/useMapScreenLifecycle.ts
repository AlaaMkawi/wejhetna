import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { useMapScreenOverlays } from "./useMapScreenOverlays";

/**
 * Map screens: overlay gating + deferred navigation + active-screen guard for async work.
 */
export function useMapScreenLifecycle() {
  const screenActiveRef = useRef(true);
  const { showOverlays, hideOverlays, exitMapScreen, withOverlayPause } = useMapScreenOverlays();

  useFocusEffect(
    useCallback(() => {
      screenActiveRef.current = true;
      return () => {
        screenActiveRef.current = false;
      };
    }, [])
  );

  const runWhenActive = useCallback((action: () => void) => {
    if (screenActiveRef.current) {
      action();
    }
  }, []);

  const leaveMapScreen = useCallback(
    (cleanup: () => void, navigate: () => void) => {
      cleanup();
      exitMapScreen(navigate);
    },
    [exitMapScreen]
  );

  return {
    showOverlays,
    hideOverlays,
    exitMapScreen,
    withOverlayPause,
    leaveMapScreen,
    screenActiveRef,
    runWhenActive,
    isScreenActive: () => screenActiveRef.current,
  };
}
