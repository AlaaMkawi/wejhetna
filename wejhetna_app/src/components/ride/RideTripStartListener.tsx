import React, { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import {
  getDriverRideRequests,
  getRegularLatestRideRequest,
  normalizeRideRequestStatus,
  parseStoredUserId,
  type RegularLatestRideRequest,
  type RideRequestStatus,
} from "../../api/rides";
import { RIDE_STATUS_POLL_INTERVAL_MS } from "../../../config";
import { RootStackParamList } from "../../navigation/types";
import { navigateToRideTripToDestination } from "../../utils/rideNavigateToTripScreen";
import { shouldSuppressInProgressTripPromotion } from "../../utils/rideTripStartPromotionGate";
import { RideVerifySuccessModal } from "./RideVerifySuccessModal";

/**
 * When the *other* party completes OTP, this device sees `arrived` → `in_progress` on poll:
 * same 5s success overlay as the verifying user, then navigate to shared trip screen.
 */
export default function RideTripStartListener() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [modalVisible, setModalVisible] = useState(false);
  const rideIdRef = useRef<number | null>(null);
  const driverPrevByIdRef = useRef<Record<number, RideRequestStatus>>({});
  const passengerPrevRef = useRef<{ id: number | null; status: RideRequestStatus | null }>({
    id: null,
    status: null,
  });
  const initializedRef = useRef(false);

  const onTimerComplete = useCallback(() => {
    setModalVisible(false);
    const id = rideIdRef.current;
    rideIdRef.current = null;
    if (id == null) return;
    navigateToRideTripToDestination(navigation, id, { showTripSuccessIntro: false });
  }, [navigation]);

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      const role = await AsyncStorage.getItem("userRole");
      if (!mounted || role !== "DRIVER" && role !== "REGULAR") return;

      const stored = await AsyncStorage.getItem("userId");
      const uid = parseStoredUserId(stored);
      if (uid == null) return;

      if (role === "DRIVER") {
        let list: Awaited<ReturnType<typeof getDriverRideRequests>> = [];
        try {
          list = await getDriverRideRequests(uid);
        } catch {
          return;
        }
        if (!mounted) return;

        if (!initializedRef.current) {
          const next: Record<number, RideRequestStatus> = {};
          for (const row of list) {
            next[row.id] = normalizeRideRequestStatus(row.status);
          }
          driverPrevByIdRef.current = next;
          initializedRef.current = true;
          return;
        }

        for (const row of list) {
          const prev = driverPrevByIdRef.current[row.id];
          const st = normalizeRideRequestStatus(row.status);
          if (prev === "arrived" && st === "in_progress") {
            if (!shouldSuppressInProgressTripPromotion(row.id)) {
              rideIdRef.current = row.id;
              setModalVisible(true);
              break;
            }
          }
        }

        const next: Record<number, RideRequestStatus> = {};
        for (const row of list) {
          next[row.id] = normalizeRideRequestStatus(row.status);
        }
        driverPrevByIdRef.current = next;
        return;
      }

      let latest: RegularLatestRideRequest | null = null;
      try {
        latest = await getRegularLatestRideRequest(uid);
      } catch {
        return;
      }
      if (!mounted) return;

      const prev = passengerPrevRef.current;
      if (!initializedRef.current) {
        initializedRef.current = true;
        passengerPrevRef.current = {
          id: latest?.id ?? null,
          status: latest ? normalizeRideRequestStatus(latest.status) : null,
        };
        return;
      }

      if (
        prev.id != null &&
        latest != null &&
        latest.id === prev.id &&
        prev.status === "arrived" &&
        normalizeRideRequestStatus(latest.status) === "in_progress"
      ) {
        if (!shouldSuppressInProgressTripPromotion(latest.id)) {
          rideIdRef.current = latest.id;
          setModalVisible(true);
        }
      }

      passengerPrevRef.current = {
        id: latest?.id ?? null,
        status: latest ? normalizeRideRequestStatus(latest.status) : null,
      };
    };

    void tick();
    const id = setInterval(() => void tick(), RIDE_STATUS_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <RideVerifySuccessModal
      visible={modalVisible}
      onTimerComplete={onTimerComplete}
      title={t("ride_verify_success_title")}
      body={t("ride_verify_success_body")}
    />
  );
}
