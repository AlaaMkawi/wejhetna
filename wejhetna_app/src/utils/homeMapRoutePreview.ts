import { Platform } from "react-native";
import { invokeHomeMapNavigationPrep } from "../components/map/homeMapNavigationPrep";
import { suppressMapOverlays } from "../components/map/mapOverlayStore";
import {
  openDrivingRoutePreview,
  type OpenDrivingRoutePreviewParams,
} from "../navigation/openDrivingRoutePreview";
import { waitForIosHomeMapBeforeRouteDetails } from "./iosMapScreenTeardown";
import { logHomeMapNav } from "./homeMapNavLog";

export type OpenDrivingRoutePreviewFromHomeParams = OpenDrivingRoutePreviewParams;

/**
 * Home map → RouteDetails: on iOS, tear down all MapLibre children and the Home
 * map shell, wait for Fabric to settle, then open route preview.
 * Android calls openDrivingRoutePreview directly (unchanged).
 */
export async function runOpenDrivingRoutePreviewFromHome(
  params: OpenDrivingRoutePreviewFromHomeParams
): Promise<void> {
  if (Platform.OS !== "ios") {
    await openDrivingRoutePreview(params);
    return;
  }

  logHomeMapNav("prepareLeaveForRoute");
  invokeHomeMapNavigationPrep();
  suppressMapOverlays();
  logHomeMapNav("mapChildrenRemoved");

  await waitForIosHomeMapBeforeRouteDetails();

  logHomeMapNav("openRoutePreview");
  await openDrivingRoutePreview({
    ...params,
    skipHomePrep: true,
  });
}
