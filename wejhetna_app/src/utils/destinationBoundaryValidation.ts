import { Alert } from "react-native";
import type { TFunction } from "i18next";
import { checkLocationInServiceCities } from "../api/places";

export type TranslateFn = TFunction;

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
      Alert.alert(t("location_outside_service_area"), t("destination_must_be_in_service_cities"), [
        { text: t("ok") },
      ]);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error checking boundary:", error);
    Alert.alert(t("boundary_check_error"), t("boundary_check_error_message"), [{ text: t("ok") }]);
    return false;
  }
}
