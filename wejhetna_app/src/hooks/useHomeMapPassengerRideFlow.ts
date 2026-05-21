import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { appAlert } from "../utils/appAlert";
import {
  createRideRequest,
  getNearbyDrivers,
  NearbyDriver,
  rideApiDetailToTranslationKey,
} from "../api/rides";
import { NEARBY_DRIVER_RADIUS_M } from "../../config";
import {
  clusterNearbyDrivers,
  zoomInTargetForCluster,
} from "../utils/nearbyDriverClustering";

function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type HomeMapDestination = { lat: number; lon: number; name?: string } | null;

export type UseHomeMapPassengerRideFlowParams = {
  userId: number | null;
  userPhone: string;
  userLocation: { lat: number; lon: number } | null;
  destination: HomeMapDestination;
  customPin: { lat: number; lon: number } | null;
  selectedPlace: { id: number } | null;
  cameraRef: React.RefObject<{ setCamera: (opts: object) => void } | null>;
  currentZoom: number;
  /** When set, driver-cluster / focus moves use one-shot camera policy (no auto-follow). */
  requestCameraMove?: (
    options: Record<string, unknown>,
    meta: { userInitiated: boolean; reason: string }
  ) => boolean;
  centerOnUserLocation?: (
    loc: { lat: number; lon: number },
    opts?: { zoomLevel?: number; animationDuration?: number }
  ) => void;
  /** Return true when booking must be blocked (alert already shown). */
  onBeforeBookRide: () => boolean;
  setCustomPin: (pin: { lat: number; lon: number } | null) => void;
  setDestination: (dest: HomeMapDestination) => void;
};

/**
 * Passenger-side ride booking on Home map (nearby drivers, popup, create request).
 * Shared by Regular, Business Owner, and Driver home screens.
 */
export function useHomeMapPassengerRideFlow({
  userId,
  userPhone,
  userLocation,
  destination,
  customPin,
  selectedPlace,
  cameraRef,
  currentZoom,
  requestCameraMove,
  centerOnUserLocation,
  onBeforeBookRide,
  setCustomPin,
  setDestination,
}: UseHomeMapPassengerRideFlowParams) {
  const { t } = useTranslation();
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<NearbyDriver | null>(null);
  const [ridePassengers, setRidePassengers] = useState(1);
  const [rideDestinationInput, setRideDestinationInput] = useState("");
  const [rideFieldHighlight, setRideFieldHighlight] = useState({
    pickup: false,
    destination: false,
  });
  const [creatingRideRequest, setCreatingRideRequest] = useState(false);
  const [rideSendErrorHint, setRideSendErrorHint] = useState<string | null>(null);
  const [rideWithDriverLoading, setRideWithDriverLoading] = useState(false);

  const refreshNearbyDrivers = useCallback(async () => {
    if (!userId || !userLocation) return;
    try {
      const drivers = await getNearbyDrivers({
        regular_user_id: userId,
        lat: userLocation.lat,
        lon: userLocation.lon,
        radius_m: NEARBY_DRIVER_RADIUS_M,
      });
      setNearbyDrivers(drivers);
    } catch {
      setNearbyDrivers([]);
    }
  }, [userId, userLocation]);

  const focusNearbyDriversOnMap = useCallback(() => {
    void refreshNearbyDrivers();
    if (!userLocation) return;
    if (centerOnUserLocation) {
      centerOnUserLocation(userLocation, { zoomLevel: 14, animationDuration: 900 });
      return;
    }
    if (cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [userLocation.lon, userLocation.lat],
        zoomLevel: 14,
        animationDuration: 900,
      });
    }
  }, [refreshNearbyDrivers, userLocation, cameraRef, centerOnUserLocation]);

  useEffect(() => {
    refreshNearbyDrivers();
  }, [refreshNearbyDrivers]);

  useEffect(() => {
    if (!selectedDriver) return;
    if (destination?.name) {
      setRideDestinationInput(destination.name);
    }
  }, [selectedDriver, destination?.lat, destination?.lon, destination?.name]);

  useEffect(() => {
    if (selectedDriver) {
      setRideSendErrorHint(null);
    }
  }, [selectedDriver]);

  useEffect(() => {
    if (userLocation) {
      setRideFieldHighlight((h) => (h.pickup ? { ...h, pickup: false } : h));
    }
  }, [userLocation]);

  const driverMapItems = useMemo(() => {
    if (nearbyDrivers.length === 0) return [];
    const anchorLat = userLocation?.lat ?? 31.24;
    return clusterNearbyDrivers(nearbyDrivers, currentZoom, anchorLat);
  }, [nearbyDrivers, currentZoom, userLocation?.lat]);

  const handleClusterTap = useCallback(
    (lat: number, lon: number) => {
      const opts = {
        centerCoordinate: [lon, lat],
        zoomLevel: zoomInTargetForCluster(currentZoom),
        animationDuration: 500,
      };
      if (requestCameraMove) {
        requestCameraMove(opts, { userInitiated: true, reason: "driver-cluster-tap" });
        return;
      }
      if (!cameraRef.current) return;
      cameraRef.current.setCamera(opts);
    },
    [currentZoom, cameraRef, requestCameraMove]
  );

  const dismissPickedDestinationPanel = useCallback(() => {
    setCustomPin(null);
    setDestination(null);
    setRideDestinationInput("");
  }, [setCustomPin, setDestination]);

  const isPickedDestinationActive = !!customPin && !selectedPlace && !!destination;

  const handleCreateRideRequest = async (overrides?: { passengers?: number }) => {
    if (!userId || !selectedDriver) return;
    if (onBeforeBookRide()) return;

    const destinationText =
      rideDestinationInput.trim() ||
      (destination
        ? destination.name?.trim() ||
          `${destination.lat.toFixed(5)}, ${destination.lon.toFixed(5)}`
        : "");

    const missingPickup = !userLocation;
    const missingDest = !destinationText;
    setRideFieldHighlight({ pickup: missingPickup, destination: missingDest });

    if (missingPickup || missingDest) {
      if (missingPickup) {
        appAlert(t("error"), t("ride_location_unavailable_hint"));
      } else if (missingDest) {
        appAlert(
          t("error"),
          t("ride_destination_required") || t("ride_destination_input_placeholder")
        );
      }
      return;
    }
    if (!userPhone) {
      appAlert(t("error"), t("ride_phone_required"));
      return;
    }

    const passengersFromPopup =
      overrides?.passengers != null && Number.isFinite(overrides.passengers)
        ? Math.max(1, Math.min(12, Math.trunc(overrides.passengers)))
        : null;
    const passengers = passengersFromPopup ?? ridePassengers;
    if (passengers <= 0) {
      appAlert(t("error"), t("ride_invalid_people_or_seats"));
      return;
    }
    if (passengersFromPopup != null && passengersFromPopup !== ridePassengers) {
      setRidePassengers(passengersFromPopup);
    }

    setRideFieldHighlight({ pickup: false, destination: false });
    setRideSendErrorHint(null);
    setCreatingRideRequest(true);
    try {
      await createRideRequest({
        regular_user_id: userId,
        driver_user_id: selectedDriver.driver_user_id,
        pickup_lat: userLocation!.lat,
        pickup_lon: userLocation!.lon,
        destination_text: destinationText,
        destination_lat: destination?.lat,
        destination_lon: destination?.lon,
        regular_phone: userPhone,
        passengers_count: passengers,
        number_of_people: passengers,
        number_of_seats_required: passengers,
      });
      setRideSendErrorHint(null);
      setSelectedDriver(null);
      appAlert(t("success"), t("ride_request_sent"));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const short = msg.length > 180 ? `${msg.slice(0, 177)}…` : msg;
      setRideSendErrorHint(short || null);
      const key = rideApiDetailToTranslationKey(msg);
      appAlert(t("error"), key ? t(key) : t("ride_failed_create_request"), [{ text: t("ok") || "OK" }]);
    } finally {
      setCreatingRideRequest(false);
    }
  };

  const handleRideWithDriverFromPlaceDetails = async () => {
    if (!userId) {
      appAlert(t("error"), t("ride_session_invalid"));
      return;
    }
    if (onBeforeBookRide()) return;
    if (!userLocation) {
      appAlert(t("error"), t("ride_location_unavailable_hint"));
      return;
    }
    if (!destination) return;

    const destText =
      destination.name?.trim() ||
      `${destination.lat.toFixed(5)}, ${destination.lon.toFixed(5)}`;
    setRideDestinationInput(destText);
    setRideFieldHighlight({ pickup: false, destination: false });
    setRideWithDriverLoading(true);
    try {
      const drivers = await getNearbyDrivers({
        regular_user_id: userId,
        lat: userLocation.lat,
        lon: userLocation.lon,
        radius_m: NEARBY_DRIVER_RADIUS_M,
      });
      setNearbyDrivers(drivers);
      if (drivers.length === 0) {
        appAlert(t("error"), t("ride_no_drivers_nearby"));
        return;
      }
      focusNearbyDriversOnMap();
      if (drivers.length === 1) {
        setSelectedDriver(drivers[0]);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const key = rideApiDetailToTranslationKey(msg);
      appAlert(t("error"), key ? t(key) : t("ride_failed_load_requests"), [{ text: t("ok") || "OK" }]);
    } finally {
      setRideWithDriverLoading(false);
    }
  };

  const trySelectDriverFromMapTap = useCallback(
    (lat: number, lon: number): boolean => {
      const MAX_DRIVER_TAP_KM = 0.07;
      let closestItem: (typeof driverMapItems)[number] | null = null;
      let closestKm = MAX_DRIVER_TAP_KM;
      for (const item of driverMapItems) {
        const km = haversineDistanceKm(lat, lon, item.lat, item.lon);
        if (km < closestKm) {
          closestKm = km;
          closestItem = item;
        }
      }
      if (!closestItem) return false;
      if (closestItem.type === "cluster") {
        handleClusterTap(closestItem.lat, closestItem.lon);
      } else {
        setSelectedDriver(closestItem.driver);
      }
      return true;
    },
    [driverMapItems, handleClusterTap]
  );

  return {
    nearbyDrivers,
    selectedDriver,
    setSelectedDriver,
    ridePassengers,
    rideDestinationInput,
    setRideDestinationInput,
    rideFieldHighlight,
    creatingRideRequest,
    rideSendErrorHint,
    setRideSendErrorHint,
    rideWithDriverLoading,
    driverMapItems,
    handleClusterTap,
    focusNearbyDriversOnMap,
    handleCreateRideRequest,
    handleRideWithDriverFromPlaceDetails,
    dismissPickedDestinationPanel,
    isPickedDestinationActive,
    trySelectDriverFromMapTap,
    haversineDistanceKm,
  };
}
