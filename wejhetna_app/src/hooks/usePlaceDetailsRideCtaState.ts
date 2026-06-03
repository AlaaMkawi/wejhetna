import { useCallback, useEffect, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { appAlert } from "../utils/appAlert";
import {
  getDriverAvailability,
  getRegularLatestRideRequest,
  isActiveBlockingRideStatus,
  parseStoredUserId,
} from "../api/rides";
import { RIDE_STATUS_POLL_INTERVAL_MS } from "../../config";
import {
  DRIVER_AVAILABILITY_CHANGED_EVENT,
  getDriverAvailabilityCached,
  setDriverAvailabilityCached,
} from "../utils/driverAvailabilitySession";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type PlaceDetailsViewerRole = "REGULAR" | "DRIVER" | "BUSINESS_OWNER" | "ADMIN" | null;

/**
 * Shared ride-with-driver CTA rules for place-details sheets on all Home maps.
 * Drivers who are online for requests cannot book a ride as a passenger from the map.
 */
export function usePlaceDetailsRideCtaState(
  userId: number | null,
  userRole: PlaceDetailsViewerRole
) {
  const { t } = useTranslation();
  const [passengerRideLatest, setPassengerRideLatest] = useState<Awaited<
    ReturnType<typeof getRegularLatestRideRequest>
  > | null>(null);
  const [driverIsOnline, setDriverIsOnline] = useState(() => getDriverAvailabilityCached());

  const refreshPassengerRide = useCallback(async () => {
    if (userId == null) {
      setPassengerRideLatest(null);
      return;
    }
    try {
      const row = await getRegularLatestRideRequest(userId);
      setPassengerRideLatest(row);
    } catch {
      setPassengerRideLatest(null);
    }
  }, [userId]);

  const refreshDriverAvailability = useCallback(async () => {
    if (userRole !== "DRIVER" || userId == null) {
      setDriverIsOnline(false);
      return;
    }
    try {
      const availability = await getDriverAvailability(userId);
      setDriverAvailabilityCached(availability.is_available);
      setDriverIsOnline(availability.is_available);
    } catch {
      setDriverIsOnline(getDriverAvailabilityCached());
    }
  }, [userRole, userId]);

  useFocusEffect(
    useCallback(() => {
      void refreshPassengerRide();
      void refreshDriverAvailability();
      const ridePoll = setInterval(() => void refreshPassengerRide(), RIDE_STATUS_POLL_INTERVAL_MS);
      return () => clearInterval(ridePoll);
    }, [refreshPassengerRide, refreshDriverAvailability])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      DRIVER_AVAILABILITY_CHANGED_EVENT,
      (payload: { isAvailable?: boolean }) => {
        if (typeof payload?.isAvailable === "boolean") {
          setDriverIsOnline(payload.isAvailable);
        }
      }
    );
    return () => sub.remove();
  }, []);

  const hasBlockingPassengerRide =
    passengerRideLatest != null && isActiveBlockingRideStatus(passengerRideLatest.status);

  const rideWithDriverMuted =
    hasBlockingPassengerRide || (userRole === "DRIVER" && driverIsOnline);

  const alertIfCannotBookRide = useCallback((): boolean => {
    if (userRole === "DRIVER" && driverIsOnline) {
      appAlert(
        t("ride_driver_active_cannot_book_title"),
        t("ride_driver_active_cannot_book_message"),
        [{ text: t("ok") || "OK" }]
      );
      return true;
    }
    if (hasBlockingPassengerRide) {
      appAlert(t("ride_active_request_title"), t("ride_active_request_message"), [
        { text: t("ok") || "OK" },
      ]);
      return true;
    }
    return false;
  }, [userRole, driverIsOnline, hasBlockingPassengerRide, t]);

  return {
    hasBlockingPassengerRide,
    rideWithDriverMuted,
    driverIsOnline,
    alertIfCannotBookRide,
    refreshPassengerRide,
  };
}

/** Resolve numeric user id + role from storage (Home screens on mount). */
export async function loadHomeMapViewerContext(): Promise<{
  userId: number | null;
  userRole: PlaceDetailsViewerRole;
}> {
  try {
    const storedId = await AsyncStorage.getItem("userId");
    const role = await AsyncStorage.getItem("userRole");
    const userId = parseStoredUserId(storedId);
    const userRole: PlaceDetailsViewerRole =
      role === "DRIVER"
        ? "DRIVER"
        : role === "BUSINESS_OWNER"
          ? "BUSINESS_OWNER"
          : role === "ADMIN"
            ? "ADMIN"
            : "REGULAR";
    return { userId, userRole };
  } catch {
    return { userId: null, userRole: null };
  }
}
