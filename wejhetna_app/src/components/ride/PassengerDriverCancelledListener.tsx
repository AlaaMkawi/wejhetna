import React, { useEffect, useRef } from "react";
import { appAlert } from "../../utils/appAlert";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { navigateToUserRideRequestsTab } from "../../utils/rideNavigateToTripScreen";
import {
  getRegularLatestRideRequest,
  isActiveBlockingRideStatus,
  normalizeRideRequestStatus,
  parseStoredUserId,
  type RegularLatestRideRequest,
  type RideRequestStatus,
} from "../../api/rides";
import { RIDE_STATUS_POLL_INTERVAL_MS } from "../../../config";
import {
  shouldSuppressDriverCancelledGlobalAlert,
  shouldSuppressVerificationMismatchGlobalAlert,
  tryConsumeRideCancelledUiAlert,
} from "../../utils/rideCancelAlertGate";
import { isPassengerRideUserRole } from "../../utils/ridePassengerRole";

/**
 * Passengers (REGULAR, BUSINESS_OWNER): poll latest ride; when an active ride becomes `cancelled`, show alert (driver cancel).
 * Skips briefly after the passenger cancelled their own ride from the app.
 */
export default function PassengerDriverCancelledListener() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const prevRef = useRef<{ id: number | null; status: RideRequestStatus | null }>({
    id: null,
    status: null,
  });
  const initializedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      const role = await AsyncStorage.getItem("userRole");
      if (!mounted || !isPassengerRideUserRole(role)) {
        return;
      }
      const stored = await AsyncStorage.getItem("userId");
      const uid = parseStoredUserId(stored);
      if (uid == null) {
        return;
      }

      let latest: RegularLatestRideRequest | null = null;
      try {
        latest = await getRegularLatestRideRequest(uid);
      } catch {
        return;
      }
      if (!mounted) {
        return;
      }

      const prev = prevRef.current;
      if (initializedRef.current && prev.id != null && prev.status != null) {
        const wasBlocking = isActiveBlockingRideStatus(prev.status);
        const nowCancelled =
          latest != null &&
          latest.id === prev.id &&
          normalizeRideRequestStatus(latest.status) === "cancelled";
        if (wasBlocking && nowCancelled) {
          const note = latest.status_note ?? "";
          const verifyMismatch =
            note.includes("invalid verification") || note.includes("too many invalid");
          const showVerifyMismatchUi =
            verifyMismatch && !shouldSuppressVerificationMismatchGlobalAlert();
          const showDriverCancelledUi =
            !verifyMismatch && !shouldSuppressDriverCancelledGlobalAlert();
          if (
            showVerifyMismatchUi ||
            showDriverCancelledUi
          ) {
            if (!tryConsumeRideCancelledUiAlert(latest.id)) {
              /* Dedup slot already used for this ride — cancellation still syncs; no stacked alerts. */
            } else if (showVerifyMismatchUi) {
              appAlert(
                t("ride_cancelled_verification_mismatch_title"),
                t("ride_cancelled_verification_mismatch_message"),
                [
                  {
                    text: t("ok"),
                    onPress: () => navigateToUserRideRequestsTab(navigation, "REGULAR"),
                  },
                ]
              );
            } else if (showDriverCancelledUi) {
              appAlert(
                t("ride_cancelled_by_driver_title"),
                t("ride_cancelled_by_driver_message"),
                [
                  {
                    text: t("ok"),
                    onPress: () => navigateToUserRideRequestsTab(navigation, "REGULAR"),
                  },
                ]
              );
            }
          }
        }
      }

      initializedRef.current = true;
      prevRef.current = {
        id: latest?.id ?? null,
        status: latest ? normalizeRideRequestStatus(latest.status) : null,
      };
    };

    void tick();
    const id = setInterval(() => {
      void tick();
    }, RIDE_STATUS_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [navigation, t]);

  return null;
}
