import type { Dispatch, SetStateAction } from "react";
import type { LatLon } from "./locationPermission";

/** Same threshold as RouteDetails destination arrival. */
export const NAV_DEST_ARRIVAL_RADIUS_M = 55;

export type HomeMapDraftNavState = {
  setRouteLoading: Dispatch<SetStateAction<boolean>>;
  setDestination: Dispatch<SetStateAction<{ lat: number; lon: number; name?: string } | null>>;
  setCustomPin: Dispatch<SetStateAction<{ lat: number; lon: number } | null>>;
  setIsPickingMapDestination: Dispatch<SetStateAction<boolean>>;
  setPickPreviewCoords: Dispatch<SetStateAction<{ lat: number; lon: number } | null>>;
  pickMapTapInFlightRef?: { current: boolean };
  setMapPickChoiceModalVisible?: Dispatch<SetStateAction<boolean>>;
  /** Re-fetch map user dot after RouteDetails / live nav exit (Regular / BO). */
  refreshUserLocation?: () => void | Promise<void>;
};

/**
 * Reset Home map UI after leaving RouteDetails so the next place / business nav CTA works.
 * Called from LIVE_NAVIGATION_EXIT and on Home focus as a safety net.
 */
export function resetHomeMapDraftNavigationState(state: HomeMapDraftNavState): void {
  state.setRouteLoading(false);
  state.setDestination(null);
  state.setCustomPin(null);
  state.setIsPickingMapDestination(false);
  state.setPickPreviewCoords(null);
  if (state.pickMapTapInFlightRef) {
    state.pickMapTapInFlightRef.current = false;
  }
  state.setMapPickChoiceModalVisible?.(false);
}
