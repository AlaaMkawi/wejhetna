import {
  openDrivingRoutePreview,
  type OpenDrivingRoutePreviewParams,
} from "../navigation/openDrivingRoutePreview";

export type OpenDrivingRoutePreviewFromHomeParams = OpenDrivingRoutePreviewParams;

/**
 * Home map → RouteDetails. iOS map teardown runs only when navigation actually
 * starts (inside runMapSafeNavigation), after GPS/OSRM succeed — not before, so a
 * failed preview does not unmount the map or clear draft pins.
 */
export async function runOpenDrivingRoutePreviewFromHome(
  params: OpenDrivingRoutePreviewFromHomeParams
): Promise<void> {
  await openDrivingRoutePreview(params);
}
