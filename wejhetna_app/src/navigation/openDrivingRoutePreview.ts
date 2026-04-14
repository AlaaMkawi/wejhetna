import { Alert } from "react-native";
import type { RootStackParamList } from "./types";
import { checkLocationInServiceCities } from "../api/places";
import {
  ensureForegroundLocationForNavigation,
  getCurrentPositionForRoute,
  isLocationTimeoutOrUnavailableError,
} from "../utils/locationPermission";
import { fetchOsrmDrivingRoute } from "../services/navigation/osrmRoute";
import { lineStringToFeatureCollection } from "../types/navigation";
import type { TranslateFn } from "../utils/destinationBoundaryValidation";

export type DrivingRouteDestination = { lat: number; lon: number; name?: string };

export type OpenDrivingRoutePreviewParams = {
  navigation: {
    navigate: (name: "RouteDetails", params: RootStackParamList["RouteDetails"]) => void;
  };
  destination: DrivingRouteDestination | null;
  t: TranslateFn;
  setRouteLoading: (loading: boolean) => void;
  setUserLocation?: (loc: { lat: number; lon: number }) => void;
};

/**
 * Shared path for “Get directions” / route preview: permission → GPS → boundary → OSRM → RouteDetails.
 * Used by place-details CTA and map point-pick flow.
 */
export async function openDrivingRoutePreview({
  navigation,
  destination,
  t,
  setRouteLoading,
  setUserLocation,
}: OpenDrivingRoutePreviewParams): Promise<void> {
  if (!destination) {
    Alert.alert(t("error"), t("please_select_destination"));
    return;
  }

  setRouteLoading(true);

  try {
    const permissionOk = await ensureForegroundLocationForNavigation();
    console.log("[GPS][routePreview] permissionOk", permissionOk);
    if (!permissionOk) {
      Alert.alert(
        t("location_required_title"),
        t("location_required_for_navigation")
      );
      return;
    }

    const freshLocation = await getCurrentPositionForRoute();
    console.log("[GPS][routePreview] freshLocation", freshLocation);
    setUserLocation?.(freshLocation);

    console.log("[GPS][routePreview] boundaryCheck start", {
      destination: { lat: destination.lat, lon: destination.lon },
    });
    const boundaryCheck = await checkLocationInServiceCities(destination.lat, destination.lon);
    console.log("[GPS][routePreview] boundaryCheck result", boundaryCheck);
    if (!boundaryCheck.is_within) {
      Alert.alert(
        t("location_outside_service_area"),
        t("destination_must_be_in_service_cities")
      );
      return;
    }

    console.log("[GPS][routePreview] osrm start", {
      origin: freshLocation,
      destination: { lat: destination.lat, lon: destination.lon },
    });
    const osrm = await fetchOsrmDrivingRoute(freshLocation, destination);
    console.log("[GPS][routePreview] osrm ok", {
      distanceMeters: osrm.distanceMeters,
      durationSeconds: osrm.durationSeconds,
      coords: osrm.coordinates?.length,
    });

    const routeInfoData = {
      distance: osrm.distanceMeters,
      duration: osrm.durationSeconds,
      startAddress: t("your_location"),
      endAddress: destination.name || t("destination"),
    };

    const routeCoords = lineStringToFeatureCollection(osrm.coordinates);

    console.log("[GPS][routePreview] navigate RouteDetails", {
      userLocation: freshLocation,
      destination: { lat: destination.lat, lon: destination.lon },
      navigationPhase: "preview",
    });
    navigation.navigate("RouteDetails", {
      routeInfo: routeInfoData,
      destination,
      userLocation: freshLocation,
      routeCoordinates: routeCoords,
      navigationPhase: "preview",
    });
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    console.error("Route error:", err?.message || String(error));
    console.log("[GPS][routePreview] error details", { code: err?.code, message: err?.message });
    const code = err?.code;
    if (code === 1) {
      Alert.alert(t("location_required_title"), t("location_required_for_navigation"));
    } else if (isLocationTimeoutOrUnavailableError(error)) {
      Alert.alert(t("route_location_timeout_title"), t("route_location_timeout_body"));
    } else {
      Alert.alert(
        t("route_error"),
        err?.message || t("could_not_get_route")
      );
    }
  } finally {
    setRouteLoading(false);
  }
}
