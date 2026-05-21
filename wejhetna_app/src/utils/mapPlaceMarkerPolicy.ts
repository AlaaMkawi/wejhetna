import type { PlaceForMap } from "../api/places";

/**
 * Shared zoom policy for home-map place markers (Google Maps–style tiers).
 * Used by RegularHome today; Admin/Driver/BO can adopt in a follow-up pass.
 */

/** Below this zoom, nearby places collapse into count clusters (except selected). */
export const PLACE_CLUSTER_BREAK_ZOOM = 13.5;

/** Public services (hospitals, schools, …) — visible as pins once clustering ends. */
export const PUBLIC_SERVICE_VISIBILITY_ZOOM = 0;

/** Businesses stay hidden until neighbourhood zoom to reduce clutter. */
export const BUSINESS_VISIBILITY_ZOOM = 14;

export const PUBLIC_SERVICE_LABEL_ZOOM = 15;
export const BUSINESS_LABEL_ZOOM = 16;

export function shouldShowPlacePin(
  place: PlaceForMap,
  zoom: number,
  isSelected: boolean
): boolean {
  if (isSelected) return true;
  if (place.place_type === "PUBLIC_SERVICE") {
    return zoom >= PUBLIC_SERVICE_VISIBILITY_ZOOM;
  }
  if (place.place_type === "BUSINESS") {
    return zoom >= BUSINESS_VISIBILITY_ZOOM;
  }
  return zoom >= PUBLIC_SERVICE_VISIBILITY_ZOOM;
}

export function shouldShowPlaceLabel(
  place: PlaceForMap,
  zoom: number,
  isSelected: boolean
): boolean {
  if (isSelected) return true;
  if (place.place_type === "PUBLIC_SERVICE") {
    return zoom >= PUBLIC_SERVICE_LABEL_ZOOM;
  }
  if (place.place_type === "BUSINESS") {
    return zoom >= BUSINESS_LABEL_ZOOM;
  }
  return zoom >= PUBLIC_SERVICE_LABEL_ZOOM;
}

export function shouldClusterPlaces(zoom: number): boolean {
  return Number.isFinite(zoom) && zoom < PLACE_CLUSTER_BREAK_ZOOM;
}

/** Camera target after tapping a place cluster badge. */
export function zoomInTargetForPlaceCluster(currentZoom: number): number {
  const base = Number.isFinite(currentZoom) ? currentZoom : 12;
  return Math.min(base + 2, 17);
}
