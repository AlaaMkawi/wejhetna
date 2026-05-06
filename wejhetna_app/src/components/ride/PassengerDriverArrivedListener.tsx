import React, { useEffect, useRef } from "react";
import { appAlert } from "../../utils/appAlert";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { useNavigationState } from "@react-navigation/native";
import {
  getRegularLatestRideRequest,
  normalizeRideRequestStatus,
  parseStoredUserId,
  type RegularLatestRideRequest,
  type RideRequestStatus,
} from "../../api/rides";
import { RIDE_STATUS_POLL_INTERVAL_MS } from "../../../config";
import { isPassengerRideUserRole } from "../../utils/ridePassengerRole";

/**
 * Global (app-wide) popup for the PASSENGER the moment the driver has arrived
 * at the pickup point. Detected by polling the passenger's latest ride and
 * observing the status transition:
 *   on_the_way|driving_to_customer  →  arrived
 *
 * Behaviour after the passenger taps OK:
 *   - If the passenger is currently inside a pickup-route screen
 *     (RidePickupNavigation, RideTrackingMap, or RouteDetails while tracking
 *     the driver), return them to their requests tab.
 *   - Otherwise, stay put – the alert is informational only.
 *
 * REGULAR and BUSINESS_OWNER passengers; same as transport-tab ride UX.
 * Only one popup is shown per transition; a guard ref prevents duplicates.
 */
export default function PassengerDriverArrivedListener() {
  const { t } = useTranslation();

  // Keep a reactive snapshot of the active top-level route so we know whether
  // the passenger is already in a pickup screen and the inline UI is enough.
  const routeName = useNavigationState((state) => {
    if (!state) return null;
    try {
      // Walk to the innermost active route so nested stacks/tabs are respected.
      let s: any = state;
      let r: any = s.routes?.[s.index ?? 0];
      while (r?.state) {
        s = r.state;
        r = s.routes?.[s.index ?? 0];
      }
      return r?.name ?? null;
    } catch {
      return null;
    }
  });
  const routeNameRef = useRef<string | null>(null);
  useEffect(() => {
    routeNameRef.current = routeName;
  }, [routeName]);

  const prevRef = useRef<{ id: number | null; status: RideRequestStatus | null }>({
    id: null,
    status: null,
  });
  const initializedRef = useRef(false);
  const firedForIdRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      const role = await AsyncStorage.getItem("userRole");
      if (!mounted || !isPassengerRideUserRole(role)) return;

      const stored = await AsyncStorage.getItem("userId");
      const uid = parseStoredUserId(stored);
      if (uid == null) return;

      let latest: RegularLatestRideRequest | null = null;
      try {
        latest = await getRegularLatestRideRequest(uid);
      } catch {
        return;
      }
      if (!mounted) return;

      const prev = prevRef.current;
      if (initializedRef.current && prev.id != null && prev.status != null && latest != null) {
        const wasEnRoute =
          prev.id === latest.id &&
          (prev.status === "on_the_way" || prev.status === "driving_to_customer");
        const nowArrived = normalizeRideRequestStatus(latest.status) === "arrived";
        if (wasEnRoute && nowArrived && firedForIdRef.current !== latest.id) {
          firedForIdRef.current = latest.id;
          const currentRouteName = routeNameRef.current;
          const insidePickupScreen =
            currentRouteName === "RidePickupNavigation" ||
            currentRouteName === "RideTrackingMap" ||
            currentRouteName === "RouteDetails";

          // If the passenger is already viewing a live pickup screen, the arrival
          // is communicated inline by that screen's UI. Skip the global alert to
          // avoid a redundant popup.
          if (!insidePickupScreen) {
            appAlert(
              t("ride_passenger_driver_arrived_title"),
              t("ride_passenger_driver_arrived_message"),
              [{ text: t("ok") }]
            );
          }
        }
      }

      initializedRef.current = true;
      prevRef.current = {
        id: latest?.id ?? null,
        status: latest ? normalizeRideRequestStatus(latest.status) : null,
      };

      // Reset the fired guard once the ride no longer exists or transitions
      // further (arrived → in_progress/completed/cancelled) so a later ride
      // can trigger its own popup.
      if (latest == null || normalizeRideRequestStatus(latest.status) !== "arrived") {
        if (firedForIdRef.current != null && (latest == null || latest.id !== firedForIdRef.current)) {
          firedForIdRef.current = null;
        }
      }
    };

    void tick();
    const id = setInterval(() => {
      void tick();
    }, RIDE_STATUS_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [t]);

  return null;
}
