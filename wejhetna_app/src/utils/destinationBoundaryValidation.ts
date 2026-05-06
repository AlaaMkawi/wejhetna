import type { TFunction } from "i18next";
import { appAlert } from "./appAlert";
import { checkLocationInServiceCities } from "../api/places";

export type TranslateFn = TFunction;

let lastBoundaryFailureAlertAt = 0;
const BOUNDARY_ALERT_COOLDOWN_MS = 45000;

/**
 * Validates that a map point is inside Tel Sheva / Lakiya / Rahat.
 * Shows the same alerts as the existing long-press / route flows.
 */
export async function assertDestinationInServiceCities(
  lat: number,
  lon: number,
  t: TranslateFn
): Promise<boolean> {
  try {
    const boundaryCheck = await checkLocationInServiceCities(lat, lon);
    if (!boundaryCheck.is_within) {
      appAlert(t("location_outside_service_area"), t("destination_must_be_in_service_cities"), [
        { text: t("ok") },
      ]);
      return false;
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn("[assertDestinationInServiceCities]", error);
    }
    const now = Date.now();
    if (now - lastBoundaryFailureAlertAt > BOUNDARY_ALERT_COOLDOWN_MS) {
      lastBoundaryFailureAlertAt = now;
      appAlert(t("boundary_check_error"), t("boundary_check_error_message"), [{ text: t("ok") }]);
    }
    return false;
  }
}
