import { useCallback, useEffect } from "react";
import { DeviceEventEmitter } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { LIVE_NAVIGATION_EXIT_EVENT } from "../navigation/navigationEvents";
import {
  resetHomeMapDraftNavigationState,
  type HomeMapDraftNavState,
} from "../utils/homeNavigationExit";

/**
 * Wire LIVE_NAVIGATION_EXIT + Home tab focus to release route CTA loading and draft pins.
 * Use on every role Home map (Regular, Driver, Business Owner, Admin).
 */
export function useHomeMapDraftNavigationCleanup(state: HomeMapDraftNavState): void {
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LIVE_NAVIGATION_EXIT_EVENT, () => {
      resetHomeMapDraftNavigationState(state);
      void state.refreshUserLocation?.();
    });
    return () => sub.remove();
    // setState fns from useState are stable; ref object identity is stable per screen mount.
  }, []);

  useFocusEffect(
    useCallback(() => {
      state.setRouteLoading(false);
      if (state.pickMapTapInFlightRef) {
        state.pickMapTapInFlightRef.current = false;
      }
      void state.refreshUserLocation?.();
    }, [])
  );
}
