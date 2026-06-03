import { PLACE_CLUSTER_BREAK_ZOOM } from "./mapPlaceMarkerPolicy";
import { quantizeZoomForMarkers } from "../components/map/markerScale";

/** Clustering / visibility tier — only these changes should re-render marker trees. */
export function markerZoomTier(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  if (zoom < PLACE_CLUSTER_BREAK_ZOOM) return 0;
  if (zoom < 14) return 1;
  return 2;
}

export function zoomForMarkerRender(zoom: number): number {
  return quantizeZoomForMarkers(zoom);
}
