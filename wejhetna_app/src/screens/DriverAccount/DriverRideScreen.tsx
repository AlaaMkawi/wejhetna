import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appAlert } from "../../utils/appAlert";
import { ActivityIndicator, SectionList, Linking, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useTranslation } from "react-i18next";
import {
  acceptRideRequest,
  cancelRideRequest,
  DriverRideRequest,
  getDriverAvailability,
  getDriverRideRequests,
  parseStoredUserId,
  rejectRideRequest,
  rideApiDetailToTranslationKey,
  startDrivingToCustomer,
  unlockPassengerVerificationForRide,
  updateDriverAvailability,
  updateDriverLocation,
  verifyRideStartCode,
} from "../../api/rides";
import { RIDE_STATUS_POLL_INTERVAL_MS } from "../../../config";
import { requestCurrentPositionWithRetry } from "../../utils/locationPermission";
import { RideVerifySuccessModal } from "../../components/ride/RideVerifySuccessModal";
import { RideVerificationCodeModal } from "../../components/ride/RideVerificationCodeModal";
import { RideDestinationDetailsModal } from "../../components/ride/RideDestinationDetailsModal";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";
import { useListBottomPad } from "../../theme/safeArea";
import {
  markVerificationMismatchSelfAlert,
  tryConsumeRideCancelledUiAlert,
} from "../../utils/rideCancelAlertGate";
import { markTripStartHandledLocally } from "../../utils/rideTripStartPromotionGate";
import { formatDistanceText } from "../../utils/formatDistance";
import {
  navigateToRideTripToDestination,
  navigateToRidePickupNavigation,
  navigateToUserRideRequestsTab,
} from "../../utils/rideNavigateToTripScreen";
import i18n from "../../i18n";

const ARRIVING_SOON_ETA_MIN = 3;

type SectionType = "active" | "incoming" | "history";

type RideListSection = {
  type: SectionType;
  title: string;
  data: DriverRideRequest[];
};

function driverTrackingPhaseKey(item: DriverRideRequest): string | null {
  if (item.status === "accepted") {
    return "ride_driver_tracking_phase_accepted";
  }
  if (item.status === "on_the_way" || item.status === "driving_to_customer") {
    const eta = item.eta_to_pickup_min ?? item.eta_to_user;
    if (eta != null && eta <= ARRIVING_SOON_ETA_MIN) {
      return "ride_driver_tracking_phase_arriving_pickup";
    }
    return "ride_driver_tracking_phase_en_route";
  }
  if (item.status === "arrived") {
    return "ride_driver_tracking_phase_arrived_otp";
  }
  return null;
}

function displayPassengerName(item: DriverRideRequest): string {
  const n = item.regular_full_name?.trim();
  if (n) return n;
  return `@${item.regular_username}`;
}

function displayPassengerInitials(item: DriverRideRequest): string {
  const n = item.regular_full_name?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0][0] ?? "";
      const b = parts[1][0] ?? "";
      return (a + b).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  return item.regular_username.slice(0, 2).toUpperCase();
}

function formatHistoryTime(iso: string): string {
  const locale = i18n.language === "he" ? "he-IL" : "ar";
  try {
    return new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const ACTIVE_STATUSES: ReadonlySet<DriverRideRequest["status"]> = new Set([
  "accepted",
  "on_the_way",
  "driving_to_customer",
  "arrived",
  "in_progress",
]);
const HISTORY_STATUSES: ReadonlySet<DriverRideRequest["status"]> = new Set([
  "completed",
  "rejected",
  "cancelled",
]);

export default function DriverRideScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const listBottomPad = useListBottomPad(120);
  const verifySuccessTripIdRef = useRef<number | null>(null);
  const [verifySuccessVisible, setVerifySuccessVisible] = useState(false);
  const [driverUserId, setDriverUserId] = useState<number | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [requests, setRequests] = useState<DriverRideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyActionId, setBusyActionId] = useState<number | null>(null);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [requestsLoadError, setRequestsLoadError] = useState(false);
  const [driverPassengerReadyForVerifyByRequestId, setDriverPassengerReadyForVerifyByRequestId] = useState<
    Record<number, boolean>
  >({});
  const [verifyModalRequestId, setVerifyModalRequestId] = useState<number | null>(null);
  /**
   * When set, opens the destination preview modal showing a small map + place
   * details (if any) for the given request. Particularly useful for picked-point
   * destinations where the destination text is just "Selected destination" and
   * the driver wants to inspect the actual map location before accepting.
   */
  const [destinationPreviewRequest, setDestinationPreviewRequest] =
    useState<DriverRideRequest | null>(null);

  const incomingList = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );
  const activeList = useMemo(
    () => requests.filter((r) => ACTIVE_STATUSES.has(r.status)),
    [requests]
  );
  const historyList = useMemo(() => {
    const rows = requests.filter((r) => HISTORY_STATUSES.has(r.status));
    return [...rows].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }, [requests]);

  const completedCount = useMemo(
    () => historyList.filter((r) => r.status === "completed").length,
    [historyList]
  );

  const rideSections = useMemo((): RideListSection[] => {
    const s: RideListSection[] = [];
    if (activeList.length) {
      s.push({ type: "active", title: t("ride_active_ride_section"), data: activeList });
    }
    if (incomingList.length) {
      s.push({ type: "incoming", title: t("ride_incoming_requests"), data: incomingList });
    }
    if (historyList.length) {
      s.push({ type: "history", title: t("ride_history_section_title"), data: historyList });
    }
    return s;
  }, [activeList, incomingList, historyList, t]);

  const onVerifySuccessTimer = useCallback(() => {
    setVerifySuccessVisible(false);
    const id = verifySuccessTripIdRef.current;
    verifySuccessTripIdRef.current = null;
    if (id == null) return;
    const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
    if (parent) {
      navigateToRideTripToDestination(parent, id, { showTripSuccessIntro: false });
    }
  }, [navigation]);

  const loadDriverData = useCallback(async () => {
    const storedUserId = await AsyncStorage.getItem("userId");
    const id = parseStoredUserId(storedUserId);
    if (id == null) {
      setDriverUserId(null);
      setRequestsLoadError(false);
      setLoading(false);
      return;
    }
    setDriverUserId(id);

    try {
      const availability = await getDriverAvailability(id);
      setIsAvailable(availability.is_available);
    } catch {
      // Availability is best-effort; requests list is shown independently
    }

    try {
      const list = await getDriverRideRequests(id);
      setRequests(list);
      setRequestsLoadError(false);
    } catch {
      setRequestsLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDriverData();
      const interval = setInterval(loadDriverData, RIDE_STATUS_POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [loadDriverData])
  );

  useEffect(() => {
    setDriverPassengerReadyForVerifyByRequestId((prev) => {
      const next = { ...prev };
      for (const r of requests) {
        if (r.status === "arrived" && r.passenger_verification_unlocked) {
          next[r.id] = true;
        }
      }
      for (const key of Object.keys(next)) {
        const id = Number(key);
        const row = requests.find((rr) => rr.id === id);
        if (!row || row.status !== "arrived") {
          delete next[id];
        }
      }
      return next;
    });
  }, [requests]);

  useEffect(() => {
    if (!driverUserId || !isAvailable) return;
    const interval = setInterval(async () => {
      try {
        const current = await requestCurrentPositionWithRetry();
        await updateDriverLocation({
          driver_user_id: driverUserId,
          lat: current.coords.latitude,
          lon: current.coords.longitude,
        });
      } catch {
        // keep silent to avoid noisy UI while polling location
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [driverUserId, isAvailable]);

  const onToggleAvailability = async (next: boolean) => {
    if (!driverUserId) return;
    const previous = isAvailable;
    setIsAvailable(next);
    setUpdatingAvailability(true);
    try {
      if (next) {
        let current: Awaited<ReturnType<typeof requestCurrentPositionWithRetry>>;
        try {
          current = await requestCurrentPositionWithRetry();
        } catch {
          setIsAvailable(previous);
          appAlert(t("error"), t("failed_to_read_location"), [{ text: t("ok") || "OK" }]);
          return;
        }
        try {
          await updateDriverAvailability({
            driver_user_id: driverUserId,
            is_available: true,
            lat: current.coords.latitude,
            lon: current.coords.longitude,
          });
        } catch (e: unknown) {
          setIsAvailable(previous);
          const msg = e instanceof Error ? e.message : "";
          const key = rideApiDetailToTranslationKey(msg);
          appAlert(t("error"), key ? t(key) : t("ride_failed_update_availability"), [{ text: t("ok") || "OK" }]);
        }
      } else {
        try {
          await updateDriverAvailability({
            driver_user_id: driverUserId,
            is_available: false,
          });
        } catch (e: unknown) {
          setIsAvailable(previous);
          const msg = e instanceof Error ? e.message : "";
          const key = rideApiDetailToTranslationKey(msg);
          appAlert(t("error"), key ? t(key) : t("ride_failed_update_availability"), [{ text: t("ok") || "OK" }]);
        }
      }
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const runRequestAction = async (
    requestId: number,
    action: "accept" | "reject" | "cancel" | "start"
  ) => {
    if (!driverUserId) return;
    setBusyActionId(requestId);
    try {
      if (action === "accept") await acceptRideRequest(requestId, driverUserId);
      if (action === "reject") await rejectRideRequest(requestId, driverUserId);
      if (action === "cancel") await cancelRideRequest(requestId, driverUserId);
      if (action === "start") {
        await startDrivingToCustomer(requestId, driverUserId);
        await loadDriverData();
        const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
        if (parent) {
          navigateToRidePickupNavigation(parent, requestId);
        }
        return;
      }
      await loadDriverData();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      const key = rideApiDetailToTranslationKey(msg);
      appAlert(t("error"), key ? t(key) : t("ride_action_failed"), [{ text: t("ok") || "OK" }]);
    } finally {
      setBusyActionId(null);
    }
  };

  const runVerifyCode = async (requestId: number, rawCode: string) => {
    if (!driverUserId) return;
    const code = (rawCode ?? "").trim();
    if (code.length < 4) {
      appAlert(t("error"), t("ride_verify_code_too_short"), [{ text: t("ok") || "OK" }]);
      return;
    }
    setBusyActionId(requestId);
    try {
      await verifyRideStartCode({
        ride_request_id: requestId,
        driver_user_id: driverUserId,
        verification_code: code,
      });
      setVerifyModalRequestId(null);
      await loadDriverData();
      markTripStartHandledLocally(requestId);
      verifySuccessTripIdRef.current = requestId;
      setVerifySuccessVisible(true);
    } catch (e: unknown) {
      await loadDriverData();
      const msg = e instanceof Error ? e.message : "";
      const key = rideApiDetailToTranslationKey(msg);
      if (key === "ride_error_verify_attempts_exceeded") {
        setVerifyModalRequestId(null);
        markVerificationMismatchSelfAlert();
        const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
        if (tryConsumeRideCancelledUiAlert(requestId)) {
          appAlert(
            t("ride_cancelled_verification_mismatch_title"),
            t("ride_cancelled_verification_mismatch_message"),
            [{ text: t("ok"), onPress: () => parent && navigateToUserRideRequestsTab(parent, "DRIVER") }]
          );
        } else if (parent) {
          navigateToUserRideRequestsTab(parent, "DRIVER");
        }
        return;
      }
      appAlert(t("error"), key ? t(key) : t("ride_action_failed"), [{ text: t("ok") || "OK" }]);
    } finally {
      setBusyActionId(null);
    }
  };

  const renderActions = (item: DriverRideRequest) => {
    const isBusy = busyActionId === item.id;
    if (item.status === "pending") {
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnAccept]}
            onPress={() => runRequestAction(item.id, "accept")}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark" size={18} color={Colors.textInverse} />
            <Text style={styles.btnText}>{t("ride_accept")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnDecline]}
            onPress={() => runRequestAction(item.id, "reject")}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={18} color={Colors.textInverse} />
            <Text style={styles.btnText}>{t("ride_reject")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.status === "accepted") {
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => runRequestAction(item.id, "start")}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={18} color={Colors.textInverse} />
            <Text style={styles.btnText}>{t("ride_start_driving_to_customer")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnDeclineOutline]}
            onPress={() => runRequestAction(item.id, "cancel")}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnDeclineText}>{t("ride_cancel")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.status === "on_the_way" || item.status === "driving_to_customer") {
      return (
        <View style={styles.actionColumn}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.btnFull]}
            onPress={() => {
              const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
              if (parent) {
                navigateToRidePickupNavigation(parent, item.id);
              }
            }}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="map" size={18} color={Colors.textInverse} />
            <Text style={styles.btnText}>{t("ride_pickup_resume_navigation_button")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnDecline, styles.btnFull]}
            onPress={() => runRequestAction(item.id, "cancel")}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{t("ride_cancel")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.status === "arrived") {
      const showVerifyUi = driverPassengerReadyForVerifyByRequestId[item.id] === true;
      if (!showVerifyUi) {
        return (
          <View style={styles.waitAtPickupBlock}>
            <Text style={styles.waitAtPickupTitle}>{t("ride_driver_waiting_pickup_title")}</Text>
            <Text style={styles.waitAtPickupBody}>{t("ride_driver_waiting_pickup_body")}</Text>
            <TouchableOpacity
              style={[styles.btn, styles.btnDecline, styles.btnFull]}
              onPress={() => runRequestAction(item.id, "cancel")}
              disabled={isBusy}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>{t("ride_cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, styles.btnFull]}
              onPress={async () => {
                if (!driverUserId) return;
                setBusyActionId(item.id);
                try {
                  await unlockPassengerVerificationForRide(item.id, driverUserId);
                  setDriverPassengerReadyForVerifyByRequestId((prev) => ({ ...prev, [item.id]: true }));
                  await loadDriverData();
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : "";
                  const key = rideApiDetailToTranslationKey(msg);
                  appAlert(t("error"), key ? t(key) : t("ride_action_failed"), [{ text: t("ok") || "OK" }]);
                } finally {
                  setBusyActionId(null);
                }
              }}
              disabled={isBusy}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>{t("ride_driver_passenger_ready_button")}</Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View style={styles.verifyBlock}>
          <View style={styles.verifyPromptCard}>
            <View style={styles.verifyPromptIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.verifyPromptTextWrap}>
              <Text style={styles.verifyPromptTitle}>
                {t("ride_verify_prompt_title") || t("ride_confirm_code")}
              </Text>
              <Text style={styles.verifyPromptBody}>
                {t("ride_verify_prompt_body") || t("ride_driver_tracking_phase_arrived_otp")}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.verifyCtaBtn, isBusy && styles.verifyCtaBtnDisabled]}
            onPress={() => setVerifyModalRequestId(item.id)}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="keypad-outline" size={18} color={Colors.textInverse} style={styles.verifyCtaIcon} />
            <Text style={styles.verifyCtaText}>{t("ride_verify_open_button") || t("ride_confirm_code")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnDecline, styles.btnFull]}
            onPress={() => runRequestAction(item.id, "cancel")}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{t("ride_cancel")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.status === "in_progress") {
      return (
        <View style={styles.actionColumn}>
          <Text style={styles.tripStarted}>{t("ride_driver_trip_in_progress")}</Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary, styles.btnFull]}
            onPress={() => {
              const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
              if (parent) {
                navigateToRideTripToDestination(parent, item.id, { showTripSuccessIntro: false });
              }
            }}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={18} color={Colors.textInverse} />
            <Text style={styles.btnText}>{t("ride_trip_resume_navigation_button")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnDecline, styles.btnFull]}
            onPress={() => runRequestAction(item.id, "cancel")}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>{t("ride_cancel")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  const renderRequestItem = ({ item, section }: { item: DriverRideRequest; section: RideListSection }) => {
    const isHistory = section.type === "history";
    const isActive = section.type === "active";
    const distanceToPickupText = formatDistanceText(item.distance_to_pickup_km, t);
    const phaseKey = driverTrackingPhaseKey(item);
    const hideTrackingPhaseForPickupWait =
      item.status === "arrived" && driverPassengerReadyForVerifyByRequestId[item.id] !== true;

    return (
      <View
        style={[
          styles.card,
          isActive && styles.cardEmphasis,
          isHistory && styles.cardHistory,
        ]}
      >
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayPassengerInitials(item)}</Text>
          </View>
          <View style={styles.cardHeaderText}>
            <View style={styles.nameRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {displayPassengerName(item)}
              </Text>
              {isActive ? (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.livePillText}>{t("ride_card_live")}</Text>
                </View>
              ) : null}
            </View>
            {isHistory ? (
              <Text style={styles.cardMeta} numberOfLines={1}>
                {t("ride_history_updated")}: {formatHistoryTime(item.updated_at)}
              </Text>
            ) : null}
            {phaseKey && !hideTrackingPhaseForPickupWait ? (
              <Text style={styles.trackingPhase}>{t(phaseKey)}</Text>
            ) : null}
          </View>
        </View>

        {isHistory ? (
          <View style={styles.routeBlockMuted}>
            <View style={styles.routeRow}>
              <Ionicons name="map-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.routeLineMuted} numberOfLines={2}>
                {t("ride_pickup")}: {item.pickup_lat.toFixed(5)}, {item.pickup_lon.toFixed(5)}
              </Text>
            </View>
            <View style={styles.routeRow}>
              <Ionicons name="flag-outline" size={14} color={Colors.textMuted} />
              <Text style={styles.routeLineMuted} numberOfLines={2}>
                {item.destination_text}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.routeBlock}>
            <View style={styles.routeRow}>
              <Ionicons name="location" size={16} color={Colors.primary} />
              <View style={styles.routeTextCol}>
                <Text style={styles.routeKicker}>{t("ride_pickup")}</Text>
                <Text style={styles.routeLine}>
                  {item.pickup_lat.toFixed(5)}, {item.pickup_lon.toFixed(5)}
                </Text>
              </View>
            </View>
            <View style={styles.routeDivider} />
            <View style={styles.routeRow}>
              <Ionicons name="flag" size={16} color={Colors.accent} />
              <View style={styles.routeTextCol}>
                <Text style={styles.routeKicker}>{t("ride_destination")}</Text>
                <Text style={styles.routeLine} numberOfLines={3}>
                  {item.destination_text}
                </Text>
              </View>
            </View>
            {/*
             * Map-preview entry point. Shown whenever destination coordinates exist
             * so drivers can inspect picked-point destinations (which carry the
             * generic "Selected destination" label) on a real map before accepting.
             * Reuses RideDestinationDetailsModal which now embeds a small MapView.
             */}
            {typeof item.destination_lat === "number" &&
            typeof item.destination_lon === "number" ? (
              <TouchableOpacity
                style={styles.viewOnMapBtn}
                onPress={() => setDestinationPreviewRequest(item)}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Ionicons name="map-outline" size={16} color={Colors.primary} />
                <Text style={styles.viewOnMapBtnText}>
                  {t("ride_destination_view_on_map_button")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {!isHistory ? (
          <View style={styles.detailList}>
            <Text style={styles.detailLine}>
              {t("ride_number_of_people")}: {item.number_of_people ?? item.passengers_count}
            </Text>
            <Text style={styles.detailLine}>
              {t("ride_seats_required")}: {item.number_of_seats_required ?? item.passengers_count}
            </Text>
            {distanceToPickupText != null ? (
              <Text style={styles.detailLine}>
                {t("ride_driver_distance_to_user")}: {distanceToPickupText}
              </Text>
            ) : null}
            {(item.eta_to_user ?? item.eta_to_pickup_min) != null ? (
              <Text style={styles.detailLine}>
                {t("ride_eta_to_user")}: {item.eta_to_user ?? item.eta_to_pickup_min} {t("ride_min")}
              </Text>
            ) : null}
            {item.estimated_trip_time != null ? (
              <Text style={styles.detailLine}>
                {t("ride_estimated_trip_time")}: {item.estimated_trip_time} {t("ride_min")}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View
          style={[
            styles.statusPill,
            item.status === "completed" && styles.statusPillSuccess,
            (item.status === "cancelled" || item.status === "rejected") && styles.statusPillDanger,
          ]}
        >
          <Text style={styles.statusPillText}>{t(`ride_status_${item.status}`)}</Text>
        </View>

        {item.regular_phone ? (
          <TouchableOpacity
            style={styles.callButton}
            onPress={() => Linking.openURL(`tel:${item.regular_phone}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="call" size={16} color={Colors.primary} />
            <Text style={styles.callButtonText}>{t("ride_call_user", { phone: item.regular_phone })}</Text>
          </TouchableOpacity>
        ) : !isHistory ? (
          <Text style={styles.hiddenPhoneText}>{t("ride_phone_visible_after_accept")}</Text>
        ) : null}

        {renderActions(item)}
        {busyActionId === item.id ? <ActivityIndicator color={Colors.primary} style={styles.inlineLoader} /> : null}
      </View>
    );
  };

  const listHeader = (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.heroGlow1} />
        <View style={styles.heroGlow2} />
        <View style={styles.heroRow}>
          <View style={styles.heroAvatar}>
            <Ionicons name="car" size={26} color={Colors.textInverse} />
          </View>
          <View style={styles.heroTitles}>
            <Text style={styles.heroEyebrow}>{t("ride_driver_dashboard_eyebrow")}</Text>
            <Text style={styles.heroTitle}>{t("ride_driver_dashboard_title")}</Text>
          </View>
        </View>
        <View style={styles.availabilityRow}>
          <View style={styles.availabilityIconWrap}>
            <View
              style={[
                styles.availabilityIcon,
                { backgroundColor: isAvailable ? Colors.primary : Colors.borderStrong },
              ]}
            >
              <Ionicons name="power" size={18} color={Colors.textInverse} />
            </View>
            {isAvailable ? <View style={styles.pingRing} /> : null}
          </View>
          <View style={styles.availabilityTextCol}>
            <Text style={styles.availabilityState}>
              {isAvailable ? t("ride_driver_online") : t("ride_driver_offline")}
            </Text>
            <Text style={styles.availabilitySub}>
              {isAvailable ? t("ride_driver_online_sub") : t("ride_driver_offline_sub")}
            </Text>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={onToggleAvailability}
            disabled={updatingAvailability}
            trackColor={{ false: "#c4c4c4", true: Colors.primary }}
            thumbColor={Colors.surface}
            ios_backgroundColor="#c4c4c4"
          />
        </View>
      </View>

      {driverUserId == null ? (
        <View style={styles.sessionWarning}>
          <Text style={styles.sessionWarningText}>{t("ride_session_invalid")}</Text>
        </View>
      ) : null}

      <View style={styles.snapshotBlock}>
        <Text style={styles.snapshotTitle}>{t("ride_driver_snapshot_label")}</Text>
        <Text style={styles.snapshotSub}>{t("ride_history_order_note")}</Text>
        <View style={styles.statGrid}>
          {[
            { k: "p", value: String(incomingList.length), label: t("ride_stat_pending") },
            { k: "a", value: String(activeList.length), label: t("ride_stat_active") },
            { k: "h", value: String(historyList.length), label: t("ride_stat_history") },
            { k: "c", value: String(completedCount), label: t("ride_stat_completed") },
          ].map((s) => (
            <View key={s.k} style={styles.statCard}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {requestsLoadError ? (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={20} color={STATUS_ERROR} style={{ marginBottom: 6 }} />
          <Text style={[styles.loadErrorText, styles.loadErrorTitle]}>{t("ride_failed_load_requests")}</Text>
        </View>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.container}>
        <SectionList<DriverRideRequest, RideListSection>
          sections={rideSections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, section }) => renderRequestItem({ item, section })}
          renderSectionHeader={({ section: sec }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderEyebrow}>{sec.title}</Text>
              <View style={styles.sectionHeaderLine} />
            </View>
          )}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            requestsLoadError ? null : (
              <View style={styles.emptyWrap}>
                <Ionicons name="file-tray-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>{t("ride_no_requests")}</Text>
              </View>
            )
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
      </View>
      <RideVerificationCodeModal
        visible={verifyModalRequestId != null}
        loading={verifyModalRequestId != null && busyActionId === verifyModalRequestId}
        failedAttempts={
          (verifyModalRequestId != null
            ? requests.find((r) => r.id === verifyModalRequestId)?.verification_failed_attempts
            : 0) ?? 0
        }
        onClose={() => {
          if (verifyModalRequestId != null && busyActionId === verifyModalRequestId) {
            return;
          }
          setVerifyModalRequestId(null);
        }}
        onSubmit={(code) => {
          if (verifyModalRequestId == null) return;
          runVerifyCode(verifyModalRequestId, code);
        }}
      />
      <RideVerifySuccessModal
        visible={verifySuccessVisible}
        onTimerComplete={onVerifySuccessTimer}
        title={t("ride_verify_success_title")}
        body={t("ride_verify_success_body")}
      />
      <RideDestinationDetailsModal
        visible={destinationPreviewRequest != null}
        onClose={() => setDestinationPreviewRequest(null)}
        destinationText={destinationPreviewRequest?.destination_text ?? ""}
        destinationLat={destinationPreviewRequest?.destination_lat ?? null}
        destinationLon={destinationPreviewRequest?.destination_lon ?? null}
      />
    </SafeAreaView>
  );
}

const STATUS_ERROR = "#b91c1c";

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.bg },
  listContent: { paddingHorizontal: 16, paddingTop: 8, flexGrow: 1 },
  emptyWrap: { alignItems: "center", paddingVertical: 32, paddingHorizontal: 16 },
  emptyText: { color: Colors.textMuted, textAlign: "center", marginTop: 8, fontSize: Typography.sizeMd },

  /** Hero + header */
  heroCard: {
    borderRadius: Radius.xxl,
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    overflow: "hidden",
    ...Shadow.card,
  },
  heroGlow1: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heroGlow2: {
    position: "absolute",
    bottom: -50,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(245,158,11,0.15)",
  },
  heroRow: { flexDirection: "row", alignItems: "center", zIndex: 1 },
  heroAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitles: { marginStart: 12, flex: 1 },
  heroEyebrow: {
    color: "rgba(255,255,255,0.75)",
    fontSize: Typography.sizeSm,
    fontWeight: Typography.weightSemibold,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: Colors.textInverse,
    fontSize: Typography.sizeXl,
    fontWeight: Typography.weightHeavy,
    marginTop: 2,
  },
  availabilityRow: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1,
  },
  availabilityIconWrap: { width: 40, height: 40, marginEnd: 10, justifyContent: "center" },
  availabilityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pingRing: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
  },
  availabilityTextCol: { flex: 1 },
  availabilityState: { color: Colors.textInverse, fontSize: Typography.sizeMd, fontWeight: Typography.weightBold },
  availabilitySub: { color: "rgba(255,255,255,0.7)", fontSize: Typography.sizeSm, marginTop: 2 },

  sessionWarning: {
    backgroundColor: Colors.warningSoft,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(180, 83, 9, 0.25)",
  },
  sessionWarningText: { color: Colors.warning, fontSize: Typography.sizeBase, textAlign: "center", lineHeight: 20 },

  snapshotBlock: { marginBottom: Spacing.lg },
  snapshotTitle: { fontSize: Typography.sizeLg, fontWeight: Typography.weightBold, color: Colors.text, marginBottom: 4 },
  snapshotSub: { fontSize: Typography.sizeSm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  statCard: {
    width: "48%",
    minWidth: 150,
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    ...Shadow.soft,
  },
  statValue: { fontSize: Typography.sizeDisplay, fontWeight: Typography.weightHeavy, color: Colors.text },
  statLabel: { fontSize: Typography.sizeSm, color: Colors.textSecondary, marginTop: 2 },

  errorBox: { marginBottom: 10, backgroundColor: Colors.dangerSoft, borderRadius: Radius.lg, padding: 12, borderWidth: 1, borderColor: "rgba(185, 28, 28, 0.2)" },
  loadErrorText: { color: STATUS_ERROR, fontSize: Typography.sizeBase, textAlign: "center" },
  loadErrorTitle: { marginBottom: 4, fontWeight: Typography.weightBold },

  sectionHeader: { marginTop: 8, marginBottom: 4 },
  sectionHeaderEyebrow: { fontSize: Typography.sizeLg, fontWeight: Typography.weightBold, color: Colors.text, marginBottom: 6 },
  sectionHeaderLine: { height: 2, borderRadius: 1, backgroundColor: Colors.primarySoft, width: 40 },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadow.soft,
  },
  cardEmphasis: { borderColor: "rgba(15, 91, 99, 0.35)", backgroundColor: Colors.primarySoft, ...Shadow.card },
  cardHistory: { paddingVertical: 12, opacity: 0.98 },

  cardTop: { flexDirection: "row", alignItems: "flex-start" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: Colors.textInverse, fontSize: 15, fontWeight: Typography.weightBold },
  cardHeaderText: { flex: 1, marginStart: 10, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { fontSize: Typography.sizeLg, fontWeight: Typography.weightBold, color: Colors.text, flex: 1 },
  cardMeta: { fontSize: Typography.sizeSm, color: Colors.textSecondary, marginTop: 2 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15, 91, 99, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.2)",
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  livePillText: { fontSize: 10, fontWeight: Typography.weightBold, color: Colors.primary, textTransform: "uppercase" },
  trackingPhase: { fontSize: Typography.sizeBase, fontWeight: Typography.weightSemibold, color: Colors.primary, marginTop: 4, lineHeight: 20 },

  routeBlock: { marginTop: 12, padding: 12, borderRadius: Radius.lg, backgroundColor: Colors.surfaceMuted, borderWidth: 1, borderColor: Colors.border },
  routeBlockMuted: { marginTop: 10, gap: 6 },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  routeDivider: { height: 10, width: 1, backgroundColor: Colors.border, marginStart: 7 },
  routeTextCol: { flex: 1, minWidth: 0 },
  routeKicker: { fontSize: 10, fontWeight: Typography.weightSemibold, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  routeLine: { fontSize: Typography.sizeBase, color: Colors.text, marginTop: 2, lineHeight: 20 },
  routeLineMuted: { fontSize: Typography.sizeSm, color: Colors.textSecondary, flex: 1, lineHeight: 19 },
  viewOnMapBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  viewOnMapBtnText: {
    fontSize: Typography.sizeSm,
    color: Colors.primary,
    fontWeight: Typography.weightSemibold,
  },

  detailList: { marginTop: 10, gap: 2 },
  detailLine: { fontSize: Typography.sizeSm, color: Colors.textSecondary, lineHeight: 19 },
  statusPill: { alignSelf: "flex-start", marginTop: 10, backgroundColor: Colors.infoSoft, paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.pill },
  statusPillSuccess: { backgroundColor: Colors.successSoft },
  statusPillDanger: { backgroundColor: Colors.dangerSoft },
  statusPillText: { fontSize: 12, fontWeight: Typography.weightBold, color: Colors.text, textTransform: "capitalize" },

  hiddenPhoneText: { color: Colors.textMuted, fontSize: Typography.sizeSm, marginTop: 8, marginBottom: 4 },
  callButton: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: Colors.primarySoft,
    borderRadius: Radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.2)",
  },
  callButtonText: { color: Colors.primary, fontWeight: Typography.weightSemibold, fontSize: Typography.sizeBase },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  actionColumn: { gap: 10, marginTop: 10 },
  btn: {
    flex: 1,
    borderRadius: Radius.lg,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnFull: { flex: 0, width: "100%" },
  btnText: { color: Colors.textInverse, fontWeight: Typography.weightBold, fontSize: Typography.sizeBase },
  btnPrimary: { backgroundColor: Colors.primary, ...Shadow.soft },
  btnAccept: { backgroundColor: Colors.success, ...Shadow.soft },
  btnDecline: { backgroundColor: Colors.danger, ...Shadow.soft },
  btnDeclineOutline: { backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.danger, flex: 0, minWidth: 100 },
  btnDeclineText: { color: Colors.danger, fontWeight: Typography.weightBold, fontSize: Typography.sizeBase },

  waitAtPickupBlock: { gap: 12, marginTop: 4 },
  waitAtPickupTitle: { fontSize: Typography.sizeLg, fontWeight: Typography.weightHeavy, color: Colors.primary, textAlign: "center" },
  waitAtPickupBody: { fontSize: Typography.sizeBase, color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },

  verifyBlock: { gap: 10, marginTop: 4 },
  verifyPromptCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  verifyPromptIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.soft,
  },
  verifyPromptTextWrap: { flex: 1 },
  verifyPromptTitle: {
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
    color: Colors.text,
    marginBottom: 2,
  },
  verifyPromptBody: { fontSize: Typography.sizeSm, color: Colors.textSecondary, lineHeight: 18 },
  verifyCtaBtn: {
    width: "100%",
    height: 48,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    ...Shadow.soft,
  },
  verifyCtaBtnDisabled: { opacity: 0.7 },
  verifyCtaIcon: { marginRight: Spacing.sm },
  verifyCtaText: { color: Colors.textInverse, fontSize: Typography.sizeBase, fontWeight: Typography.weightBold, letterSpacing: 0.2 },
  tripStarted: { fontSize: Typography.sizeBase, color: Colors.success, fontWeight: Typography.weightBold, textAlign: "center", marginTop: 4, marginBottom: 4 },
  inlineLoader: { marginTop: 8 },
});
