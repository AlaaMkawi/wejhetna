import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useMapScreenLifecycle } from "./useMapScreenLifecycle";
import { suppressMapOverlays } from "./mapOverlayStore";
import {
  registerHomeMapNavigationPrep,
  unregisterHomeMapNavigationPrep,
} from "./homeMapNavigationPrep";
import { logHomeMapNav } from "../../utils/homeMapNavLog";

export type UseHomeMapScreenOptions = {
  /** Sync: clear selection, pins, sheets before RouteDetails (iOS map teardown). */
  onPrepareLeaveForRoute?: () => void;
};

/**
 * Home tab map: overlay gating + iOS map-shell teardown before RouteDetails push.
 */
export function useHomeMapScreen(options: UseHomeMapScreenOptions = {}) {
  const lifecycle = useMapScreenLifecycle();
  const [mapShellMounted, setMapShellMounted] = useState(true);

  const onPrepareLeaveRef = useRef(options.onPrepareLeaveForRoute);
  onPrepareLeaveRef.current = options.onPrepareLeaveForRoute;

  const hideOverlaysRef = useRef(lifecycle.hideOverlays);
  hideOverlaysRef.current = lifecycle.hideOverlays;

  const screenActiveRef = lifecycle.screenActiveRef;

  const prepareLeaveForRoute = useCallback(() => {
    if (Platform.OS !== "ios") {
      return;
    }
    logHomeMapNav("ios:prepareLeaveForRoute");
    onPrepareLeaveRef.current?.();
    hideOverlaysRef.current();
    screenActiveRef.current = false;
    setMapShellMounted(false);
    suppressMapOverlays();
    logHomeMapNav("ios:mapChildrenRemoved");
  }, [screenActiveRef]);

  useFocusEffect(
    useCallback(() => {
      screenActiveRef.current = true;
      if (Platform.OS === "ios") {
        registerHomeMapNavigationPrep({ prepareLeaveForRoute });
        setMapShellMounted(true);
      }
      return () => {
        screenActiveRef.current = false;
        if (Platform.OS === "ios") {
          unregisterHomeMapNavigationPrep();
        }
      };
    }, [prepareLeaveForRoute, screenActiveRef])
  );

  const showAnnotations =
    lifecycle.showOverlays && (Platform.OS !== "ios" || mapShellMounted);

  return {
    showAnnotations,
    mapShellMounted,
    showOverlays: lifecycle.showOverlays,
    hideOverlays: lifecycle.hideOverlays,
    exitMapScreen: lifecycle.exitMapScreen,
    withOverlayPause: lifecycle.withOverlayPause,
    screenActiveRef,
    runWhenActive: lifecycle.runWhenActive,
    prepareLeaveForRoute,
  };
}
