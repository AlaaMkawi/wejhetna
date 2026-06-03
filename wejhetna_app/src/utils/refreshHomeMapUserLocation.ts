import type { Dispatch, SetStateAction } from "react";
import { getCurrentPositionReliable, type LatLon } from "./locationPermission";

/**
 * Refresh the blue user dot on Home map screens (same strategy as initial map load).
 * Separate from route-preview GPS which must not overwrite map userLocation.
 */
export async function refreshHomeMapUserLocation(
  setUserLocation: Dispatch<SetStateAction<LatLon | null>>
): Promise<void> {
  try {
    const loc = await getCurrentPositionReliable();
    if (__DEV__) {
      console.log("[GPS][homeMapRefresh] ok", loc);
    }
    setUserLocation(loc);
  } catch (e) {
    if (__DEV__) {
      console.log("[GPS][homeMapRefresh] failed", e);
    }
  }
}
