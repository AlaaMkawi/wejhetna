import React, { useEffect, useRef } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { navigateToUserRideRequestsTab } from "../../utils/rideNavigateToTripScreen";
import {
  getDriverRideRequests,
  isActiveBlockingRideStatus,
  normalizeRideRequestStatus,
  parseStoredUserId,
} from "../../api/rides";
import { RIDE_STATUS_POLL_INTERVAL_MS } from "../../../config";
import {
  shouldSuppressDriverSideGlobalCancelAlert,
  shouldSuppressVerificationMismatchGlobalAlert,
} from "../../utils/rideCancelAlertGate";

/**
 * DRIVER: compare ride snapshots; when a previously active request becomes `cancelled`, show the right dialog.
 */
export default function DriverRideCancellationListener() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const prevByIdRef = useRef<
    Record<number, { status: ReturnType<typeof normalizeRideRequestStatus>; status_note: string | null }>
  >({});

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      const role = await AsyncStorage.getItem("userRole");
      if (!mounted || role !== "DRIVER") {
        return;
      }
      const stored = await AsyncStorage.getItem("userId");
      const did = parseStoredUserId(stored);
      if (did == null) {
        return;
      }

      let list: Awaited<ReturnType<typeof getDriverRideRequests>> = [];
      try {
        list = await getDriverRideRequests(did);
      } catch {
        return;
      }
      if (!mounted) {
        return;
      }

      const prevById = prevByIdRef.current;
      for (const row of list) {
        const prev = prevById[row.id];
        const st = normalizeRideRequestStatus(row.status);
        const note = row.status_note ?? "";
        if (prev && isActiveBlockingRideStatus(prev.status) && st === "cancelled") {
          const verifyMismatch =
            note.includes("invalid verification") || note.includes("too many invalid");
          if (verifyMismatch) {
            if (!shouldSuppressVerificationMismatchGlobalAlert()) {
              Alert.alert(
                t("ride_cancelled_verification_mismatch_title"),
                t("ride_cancelled_verification_mismatch_message"),
                [
                  {
                    text: t("ok"),
                    onPress: () => navigateToUserRideRequestsTab(navigation, "DRIVER"),
                  },
                ]
              );
            }
          } else if (!shouldSuppressDriverSideGlobalCancelAlert()) {
            Alert.alert(t("ride_cancelled_by_passenger_or_system_title"), t("ride_cancelled_by_passenger_or_system_message"), [
              { text: t("ok") },
            ]);
          }
        }
      }

      const next: typeof prevById = {};
      for (const row of list) {
        next[row.id] = {
          status: normalizeRideRequestStatus(row.status),
          status_note: row.status_note ?? null,
        };
      }
      prevByIdRef.current = next;
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
