
import type { RootStackParamList } from "./types";
import { appAlert } from "../utils/appAlert";
import { checkLocationInServiceCities } from "../api/places";
import {
  ensureForegroundLocationForNavigation,
  getCurrentPositionForRoute,
  isLocationTimeoutOrUnavailableError,
} from "../utils/locationPermission";
import { fetchOsrmDrivingRoute } from "../services/navigation/osrmRoute";
import { lineStringToFeatureCollection } from "../types/navigation";
import type { TranslateFn } from "../utils/destinationBoundaryValidation";
import { runMapSafeNavigation } from "../utils/mapSafeNavigation";

export type DrivingRouteDestination = { lat: number; lon: number; name?: string };

export type OpenDrivingRoutePreviewParams = {
  navigation: {
    navigate: (name: "RouteDetails", params: RootStackParamList["RouteDetails"]) => void;
  };
  destination: DrivingRouteDestination | null;
  t: TranslateFn;
  setRouteLoading: (loading: boolean) => void;
  setUserLocation?: (loc: { lat: number; lon: number }) => void;
  /**
   * Optional override for the OSRM origin used to build the initial route polyline.
   * When omitted, uses the device GPS (existing behavior).
   */
  originOverride?: { lat: number; lon: number } | null;
  /** When omitted, defaults to preview (existing behavior). */
  navigationPhase?: "preview" | "active";
  /** Optional extras to be merged into RouteDetails params (e.g. rideContext). */
  routeDetailsExtras?: Partial<RootStackParamList["RouteDetails"]>;
  /**
   * Skip the "destination must be inside the 3 service cities" check.
   *
   * The service-area rule only applies to the **final ride destination**.
   * Pickup / driver / passenger live locations can be anywhere, so flows
   * that reuse this helper to route *toward a pickup point* (e.g. the
   * driver heading to the passenger) must opt out of the boundary check.
   */
  skipDestinationBoundaryCheck?: boolean;
  /** iOS Home already ran map teardown before this call. */
  skipHomePrep?: boolean;
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
  originOverride,
  navigationPhase,
  routeDetailsExtras,
  skipDestinationBoundaryCheck,
  skipHomePrep,
}: OpenDrivingRoutePreviewParams): Promise<void> {
  if (!destination) {
    appAlert(t("error"), t("please_select_destination"));
    return;
  }

  setRouteLoading(true);

  let navigated = false;
  try {
    const permissionOk = await ensureForegroundLocationForNavigation();
    console.log("[GPS][routePreview] permissionOk", permissionOk);
    if (!permissionOk) {
      appAlert(
        t("location_required_title"),
        t("location_required_for_navigation")
      );
      return;
    }

    const freshLocation = await getCurrentPositionForRoute();
    console.log("[GPS][routePreview] freshLocation", freshLocation);
    setUserLocation?.(freshLocation);

    // Destination boundary rule applies to the FINAL ride destination only.
    // Pickup-oriented flows (driver heading to passenger, passenger viewing
    // driver's approach) reuse this helper but must not block on the 3-city
    // restriction — the pickup point can be anywhere.
    if (!skipDestinationBoundaryCheck) {
      console.log("[GPS][routePreview] boundaryCheck start", {
        destination: { lat: destination.lat, lon: destination.lon },
      });
      const boundaryCheck = await checkLocationInServiceCities(destination.lat, destination.lon);
      console.log("[GPS][routePreview] boundaryCheck result", boundaryCheck);
      if (!boundaryCheck.is_within) {
        appAlert(
          t("location_outside_service_area"),
          t("destination_must_be_in_service_cities")
        );
        return;
      }
    } else {
      console.log("[GPS][routePreview] boundaryCheck skipped (pickup-mode)");
    }

    const osrmOrigin =
      originOverride && Number.isFinite(originOverride.lat) && Number.isFinite(originOverride.lon)
        ? { lat: originOverride.lat, lon: originOverride.lon }
        : freshLocation;

    console.log("[GPS][routePreview] osrm start", {
      origin: osrmOrigin,
      destination: { lat: destination.lat, lon: destination.lon },
    });
    const osrm = await fetchOsrmDrivingRoute(osrmOrigin, destination);
    console.log("[GPS][routePreview] osrm ok", {
      distanceMeters: osrm.distanceMeters,
      durationSeconds: osrm.durationSeconds,
      coords: osrm.coordinates?.length,
    });

    const routeInfoData = {
      distance: osrm.distanceMeters,
      duration: osrm.durationSeconds,
      startAddress: originOverride ? t("ride_pickup") : t("your_location"),
      endAddress: destination.name || t("destination"),
    };

    const routeCoords = lineStringToFeatureCollection(osrm.coordinates);

    const phase: "preview" | "active" = navigationPhase === "active" ? "active" : "preview";

    console.log("[GPS][routePreview] navigate RouteDetails", {
      userLocation: osrmOrigin,
      destination: { lat: destination.lat, lon: destination.lon },
      navigationPhase: phase,
    });
    runMapSafeNavigation(
      () => {
        navigated = true;
        navigation.navigate("RouteDetails", {
          routeInfo: routeInfoData,
          destination,
          userLocation: osrmOrigin,
          routeCoordinates: routeCoords,
          navigationPhase: phase,
          ...(routeDetailsExtras ?? {}),
        });
      },
      { skipHomePrep: skipHomePrep === true }
    );
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    console.error("Route error:", err?.message || String(error));
    console.log("[GPS][routePreview] error details", { code: err?.code, message: err?.message });
    const code = err?.code;
    if (code === 1) {
      appAlert(t("location_required_title"), t("location_required_for_navigation"));
    } else if (isLocationTimeoutOrUnavailableError(error)) {
      appAlert(t("route_location_timeout_title"), t("route_location_timeout_body"));
    } else {
      appAlert(
        t("route_error"),
        err?.message || t("could_not_get_route")
      );
    }
  } finally {
    if (!navigated) {
      setRouteLoading(false);
    }
  }
}
