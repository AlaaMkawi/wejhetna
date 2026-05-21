import { useLayoutEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PlaceForMap } from "../api/places";
import { destinationForKnownPlace, type MapDestination } from "../utils/placeDetailsDestination";

const COORD_EPS = 1e-5;

/**
 * When a known place sheet is open, keep `destination` aligned with that place so
 * nav / ride CTAs show immediately (e.g. after RouteDetails exit cleared destination).
 */
export function useSyncPlaceDetailsDestination(
  selectedPlace: PlaceForMap | null,
  destination: MapDestination | null,
  setDestination: Dispatch<SetStateAction<MapDestination | null>>,
  resolvePlaceName: (place: PlaceForMap) => string
): void {
  useLayoutEffect(() => {
    if (!selectedPlace?.location) return;
    const next = destinationForKnownPlace(selectedPlace, resolvePlaceName(selectedPlace));
    if (!next) return;

    const needsSync =
      !destination ||
      Math.abs(destination.lat - next.lat) >= COORD_EPS ||
      Math.abs(destination.lon - next.lon) >= COORD_EPS;

    if (needsSync) {
      setDestination(next);
    }
  }, [
    selectedPlace?.id,
    selectedPlace?.location?.lat,
    selectedPlace?.location?.lon,
    destination?.lat,
    destination?.lon,
    resolvePlaceName,
    setDestination,
  ]);
}
