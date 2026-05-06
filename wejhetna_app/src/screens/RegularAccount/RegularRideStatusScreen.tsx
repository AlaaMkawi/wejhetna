import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appAlert } from "../../utils/appAlert";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useTranslation } from "react-i18next";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  cancelRideRequestByPassenger,
  getRegularRideRequestsList,
  getRideFeedbackStatus,
  isActiveBlockingRideStatus,
  parseStoredUserId,
  RegularLatestRideRequest,
  rideApiDetailToTranslationKey,
  RideRequestStatus,
  verifyRideStartCode,
} from "../../api/rides";
import {
  PostRideFeedbackModal,
  type PostRideFeedbackTarget,
} from "../../components/ride/PostRideFeedbackModal";
import { RIDE_STATUS_POLL_INTERVAL_MS } from "../../../config";
import { useDriverToPickupRouteVisualization } from "../../hooks/useDriverToPickupRouteVisualization";
import {
  markPassengerCancelledOwnRide,
  markVerificationMismatchSelfAlert,
  tryConsumeRideCancelledUiAlert,
} from "../../utils/rideCancelAlertGate";
import { markTripStartHandledLocally } from "../../utils/rideTripStartPromotionGate";
import { RideVerificationAttemptHint } from "../../components/ride/RideVerificationAttemptHint";
import { RideVerifySuccessModal } from "../../components/ride/RideVerifySuccessModal";
import {
  navigateToRideTripToDestination,
  navigateToRidePickupNavigation,
  navigateToUserRideRequestsTab,
} from "../../utils/rideNavigateToTripScreen";
import { Colors, Radius, Shadow, Spacing, Typography } from "../../theme";
import { useListBottomPad } from "../../theme/safeArea";

/** ETA at or below this (minutes) shows “arriving soon” copy before “arriving now”. */
const ARRIVING_SOON_ETA_MIN = 3;

export function passengerPhaseKey(
  st: RideRequestStatus,
  eta: number | null | undefined
): string | null {
  if (st === "accepted") {
    return "ride_passenger_phase_wait_start";
  }
  if (st === "on_the_way" || st === "driving_to_customer") {
    if (eta != null && eta <= 1) {
      return "ride_passenger_phase_arriving_now";
    }
    if (eta != null && eta <= ARRIVING_SOON_ETA_MIN) {
      return "ride_passenger_phase_arriving_soon";
    }
    return "ride_passenger_phase_en_route";
  }
  if (st === "arrived") {
    return "ride_passenger_phase_at_pickup_otp";
  }
  if (st === "in_progress") {
    return "ride_passenger_phase_trip_started";
  }
  return null;
}

export function hasValidPickup(latest: RegularLatestRideRequest): boolean {
  const la = latest.pickup_lat;
  const lo = latest.pickup_lon;
  return (
    typeof la === "number" &&
    typeof lo === "number" &&
    Number.isFinite(la) &&
    Number.isFinite(lo)
  );
}

export function formatRideRequestTimestamp(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return iso;
    }
    return d.toLocaleString(locale);
  } catch {
    return iso;
  }
}

export function driverDisplayInitials(ride: RegularLatestRideRequest): string {
  const n = ride.driver_full_name?.trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return ((parts[0][0] ?? "") + (parts[1][0] ?? "")).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  return (ride.driver_username ?? "?").slice(0, 2).toUpperCase();
}

export default function RegularRideStatusScreen() {
  const { t, i18n } = useTranslation();
  const scrollBottomPad = useListBottomPad(120);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [userId, setUserId] = useState<number | null>(null);
  const [rideList, setRideList] = useState<RegularLatestRideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [cancellingPassengerRide, setCancellingPassengerRide] = useState(false);
  const [passengerVerifyInput, setPassengerVerifyInput] = useState("");
  const [busyPassengerVerify, setBusyPassengerVerify] = useState(false);
  const verifySuccessTripIdRef = useRef<number | null>(null);
  const [verifySuccessVisible, setVerifySuccessVisible] = useState(false);

  /**
   * Cached feedback status per completed ride so we can hide the "Rate" /
   * "Report" chips once the passenger already submitted their feedback — the
   * server enforces uniqueness, but caching here prevents confusing double-taps.
   */
  const [feedbackStatuses, setFeedbackStatuses] = useState<
    Record<number, { rated: boolean; reported: boolean }>
  >({});
  const [feedbackTarget, setFeedbackTarget] =
    useState<PostRideFeedbackTarget | null>(null);
  const [feedbackInitialTab, setFeedbackInitialTab] = useState<"rate" | "report">("rate");

  const onPassengerVerifySuccessTimer = useCallback(() => {
    setVerifySuccessVisible(false);
    const id = verifySuccessTripIdRef.current;
    verifySuccessTripIdRef.current = null;
    if (id == null) return;
    const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
    if (parent) {
      navigateToRideTripToDestination(parent, id, { showTripSuccessIntro: false });
    }
  }, [navigation]);

  const activeRide = useMemo(
    () => rideList.find((r) => isActiveBlockingRideStatus(r.status)) ?? null,
    [rideList]
  );

  const historyRides = useMemo(() => {
    if (activeRide == null) {
      return rideList;
    }
    return rideList.filter((r) => r.id !== activeRide.id);
  }, [rideList, activeRide]);

  const pendingCount = useMemo(
    () => rideList.filter((r) => r.status === "pending").length,
    [rideList]
  );
  const activeCount = useMemo(() => (activeRide != null ? 1 : 0), [activeRide]);
  const historyRowCount = useMemo(() => historyRides.length, [historyRides]);
  const completedCount = useMemo(
    () => rideList.filter((r) => r.status === "completed").length,
    [rideList]
  );

  const refresh = useCallback(async () => {
    const stored = await AsyncStorage.getItem("userId");
    const id = parseStoredUserId(stored);
    setUserId(id);
    if (id == null) {
      setRideList([]);
      setLoading(false);
      setLoadError(false);
      return;
    }
    try {
      const rows = await getRegularRideRequestsList(id);
      setRideList(rows);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const interval = setInterval(() => {
        void refresh();
      }, RIDE_STATUS_POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [refresh])
  );

  /**
   * Fetch feedback status for each completed ride whose status we don't know
   * yet. Limited to `completed` rides to avoid unnecessary work, and cached in
   * `feedbackStatuses` so each ride is only fetched once per screen lifetime.
   */
  useEffect(() => {
    if (userId == null) return;
    const completed = rideList.filter((r) => r.status === "completed");
    if (completed.length === 0) return;
    const pending = completed.filter((r) => feedbackStatuses[r.id] == null);
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<number, { rated: boolean; reported: boolean }> = {};
      for (const ride of pending) {
        try {
          const status = await getRideFeedbackStatus({
            ride_request_id: ride.id,
            regular_user_id: userId,
          });
          if (cancelled) return;
          updates[ride.id] = { rated: status.rated, reported: status.reported };
        } catch {
          // Silent — keep UI responsive; we'll retry on next refresh.
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setFeedbackStatuses((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rideList, userId, feedbackStatuses]);

  const openFeedbackForRide = useCallback(
    (ride: RegularLatestRideRequest, tab: "rate" | "report") => {
      if (userId == null) return;
      const status = feedbackStatuses[ride.id] ?? { rated: false, reported: false };
      setFeedbackInitialTab(tab);
      setFeedbackTarget({
        rideRequestId: ride.id,
        regularUserId: userId,
        driverFullName: ride.driver_full_name ?? "",
        driverUsername: ride.driver_username ?? "",
        alreadyRated: status.rated,
        alreadyReported: status.reported,
      });
    },
    [userId, feedbackStatuses]
  );

  const handleCancelPassengerRide = useCallback(() => {
    if (!activeRide || userId == null || !isActiveBlockingRideStatus(activeRide.status)) {
      return;
    }
    const rideRequestId = activeRide.id;
    const regularUserId = userId;
    appAlert(t("ride_passenger_cancel_confirm_title"), t("ride_passenger_cancel_confirm_message"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("ride_passenger_cancel_button"),
        style: "destructive",
        onPress: async () => {
          setCancellingPassengerRide(true);
          try {
            await cancelRideRequestByPassenger({
              ride_request_id: rideRequestId,
              regular_user_id: regularUserId,
            });
            markPassengerCancelledOwnRide();
            await refresh();
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            const key = rideApiDetailToTranslationKey(msg);
            appAlert(t("error"), key ? t(key) : msg, [{ text: t("ok") }]);
          } finally {
            setCancellingPassengerRide(false);
          }
        },
      },
    ]);
  }, [activeRide, userId, refresh, t]);

  const runPassengerVerifyCode = useCallback(async () => {
    if (!activeRide || userId == null) return;
    const code = passengerVerifyInput.trim();
    if (code.length < 4) {
      appAlert(t("error"), t("ride_verify_code_too_short"), [{ text: t("ok") }]);
      return;
    }
    setBusyPassengerVerify(true);
    try {
      await verifyRideStartCode({
        ride_request_id: activeRide.id,
        regular_user_id: userId,
        verification_code: code,
      });
      setPassengerVerifyInput("");
      await refresh();
      markTripStartHandledLocally(activeRide.id);
      verifySuccessTripIdRef.current = activeRide.id;
      setVerifySuccessVisible(true);
    } catch (e: unknown) {
      await refresh();
      const msg = e instanceof Error ? e.message : String(e);
      const key = rideApiDetailToTranslationKey(msg);
      if (key === "ride_error_verify_attempts_exceeded") {
        markVerificationMismatchSelfAlert();
        const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
        if (tryConsumeRideCancelledUiAlert(activeRide.id)) {
          appAlert(
            t("ride_cancelled_verification_mismatch_title"),
            t("ride_cancelled_verification_mismatch_message"),
            [{ text: t("ok"), onPress: () => parent && navigateToUserRideRequestsTab(parent, "REGULAR") }]
          );
        } else if (parent) {
          navigateToUserRideRequestsTab(parent, "REGULAR");
        }
        return;
      }
      appAlert(t("error"), key ? t(key) : msg, [{ text: t("ok") }]);
    } finally {
      setBusyPassengerVerify(false);
    }
  }, [activeRide, userId, passengerVerifyInput, refresh, navigation, t]);

  const pickupCoord = useMemo(() => {
    if (!activeRide || !hasValidPickup(activeRide)) return null;
    return { lat: activeRide.pickup_lat, lon: activeRide.pickup_lon };
  }, [activeRide]);

  const driverLive = useMemo(() => {
    if (
      activeRide?.driver_live_lat == null ||
      activeRide?.driver_live_lon == null ||
      !Number.isFinite(activeRide.driver_live_lat) ||
      !Number.isFinite(activeRide.driver_live_lon)
    ) {
      return null;
    }
    return { lat: activeRide.driver_live_lat, lon: activeRide.driver_live_lon };
  }, [activeRide?.driver_live_lat, activeRide?.driver_live_lon]);

  const { remainingDistanceMeters, etaSecondsRemaining } = useDriverToPickupRouteVisualization(
    driverLive,
    pickupCoord
  );

  const displayEtaMinutes = useMemo(() => {
    if (etaSecondsRemaining == null || !Number.isFinite(etaSecondsRemaining)) return null;
    if (etaSecondsRemaining <= 90) return 1;
    return Math.max(1, Math.round(etaSecondsRemaining / 60));
  }, [etaSecondsRemaining]);

  const displayDistKm = useMemo(() => {
    if (remainingDistanceMeters == null || !Number.isFinite(remainingDistanceMeters)) return null;
    return Math.round((remainingDistanceMeters / 1000) * 10) / 10;
  }, [remainingDistanceMeters]);

  const liveEtaDistLines = useMemo(() => {
    if (!activeRide) {
      return { etaLine: null as string | null, distLine: null as string | null };
    }
    const st = activeRide.status;
    const eta =
      displayEtaMinutes != null &&
      (st === "accepted" || st === "on_the_way" || st === "driving_to_customer")
        ? displayEtaMinutes
        : activeRide.eta_to_user;

    const etaLine =
      (st === "on_the_way" || st === "driving_to_customer") && eta != null && eta <= 1
        ? t("ride_driver_eta_arriving_now")
        : (st === "on_the_way" || st === "driving_to_customer") && eta != null
          ? t("ride_driver_eta_minutes_away", { minutes: eta })
          : st === "accepted" && eta != null
            ? `${t("ride_eta_pickup_estimate")}: ${eta} ${t("ride_min")}`
            : null;

    const distKm =
      displayDistKm != null &&
      (st === "accepted" ||
        st === "on_the_way" ||
        st === "driving_to_customer" ||
        st === "arrived")
        ? displayDistKm
        : activeRide.distance_to_pickup_km;

    const distLine =
      distKm != null &&
      (st === "accepted" ||
        st === "on_the_way" ||
        st === "driving_to_customer" ||
        st === "arrived")
        ? t("ride_distance_to_pickup_km", { km: distKm })
        : null;

    return { etaLine, distLine };
  }, [activeRide, displayEtaMinutes, displayDistKm, t]);

  const renderBody = () => {
    if (userId == null) {
      return (
        <View style={styles.sessionCard}>
          <Ionicons name="alert-circle-outline" size={22} color={Colors.warning} style={{ marginBottom: 8 }} />
          <Text style={styles.muted}>{t("ride_session_invalid")}</Text>
        </View>
      );
    }
    if (loadError) {
      return (
        <View style={styles.errorCard}>
          <Ionicons name="cloud-offline-outline" size={24} color={Colors.danger} style={{ marginBottom: 8 }} />
          <Text style={styles.errorText}>{t("ride_failed_load_requests")}</Text>
        </View>
      );
    }
    if (rideList.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Ionicons name="car-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.empty}>{t("ride_tracking_empty")}</Text>
        </View>
      );
    }

    const locale =
      i18n.language === "ar" ? "ar" : i18n.language === "he" ? "he-IL" : i18n.language || undefined;

    const activeCard =
      activeRide != null ? (
        (() => {
          const latest = activeRide;
          const st = latest.status;
          const eta = latest.eta_to_user;
          const phaseKey = passengerPhaseKey(st, eta);
          const phaseLine = phaseKey ? t(phaseKey) : null;

          const etaLine = liveEtaDistLines.etaLine;
          const distLine = liveEtaDistLines.distLine;
          const showPassengerCancel = isActiveBlockingRideStatus(st);
          const passengerVerificationUnlocked = latest.passenger_verification_unlocked === true;
          // Do not use "go out only" layout while the API is showing the pickup code (arrived+code).
          const showPassengerGoOutOnly =
            st === "arrived" && !passengerVerificationUnlocked && !latest.verification_code;

          const showPassengerDriverFollowBanner =
            hasValidPickup(latest) && (st === "on_the_way" || st === "driving_to_customer");

          return (
            <View style={[styles.card, styles.cardEmphasis]}>
              <View style={styles.activeCardTop}>
                <View style={styles.activeTitleRow}>
                  <Text style={styles.activeSectionLabel}>{t("ride_active_ride_section")}</Text>
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.livePillText}>{t("ride_card_live")}</Text>
                  </View>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{t(`ride_status_${st}`)}</Text>
                </View>
              </View>
              {showPassengerDriverFollowBanner ? (
                <View style={styles.passengerDriverEnRouteBox}>
                  <Text style={styles.passengerDriverEnRouteText}>
                    {t("ride_passenger_driver_en_route_banner")}
                  </Text>
                  <TouchableOpacity
                    style={styles.followDriverButton}
                    onPress={() =>
                      navigateToRidePickupNavigation(navigation, latest.id)
                    }
                    activeOpacity={0.85}
                  >
                    <Ionicons name="navigate" size={22} color={Colors.textInverse} />
                    <Text style={styles.followDriverButtonText}>
                      {t("ride_passenger_view_driver_route_button")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {showPassengerGoOutOnly ? (
                <View style={styles.passengerGoOutBanner}>
                  <Text style={styles.passengerGoOutBannerText}>{t("ride_passenger_go_to_driver_prompt")}</Text>
                </View>
              ) : null}
              {!showPassengerGoOutOnly && phaseLine ? <Text style={styles.phaseLine}>{phaseLine}</Text> : null}
              {!showPassengerGoOutOnly ? (
                <View style={styles.driverRow}>
                  <View style={styles.driverAvatar}>
                    <Text style={styles.driverAvatarText}>{driverDisplayInitials(latest)}</Text>
                  </View>
                  <View style={styles.driverTextCol}>
                    <Text style={styles.driverLine} numberOfLines={2}>
                      {latest.driver_full_name} · @{latest.driver_username}
                    </Text>
                  </View>
                </View>
              ) : null}
              {!showPassengerGoOutOnly ? (
                <View style={styles.routeBlock}>
                  <View style={styles.routeRow}>
                    <Ionicons name="flag" size={16} color={Colors.accent} />
                    <View style={styles.routeTextCol}>
                      <Text style={styles.routeKicker}>{t("ride_destination")}</Text>
                      <Text style={styles.destLine}>{latest.destination_text}</Text>
                    </View>
                  </View>
                </View>
              ) : null}
              {!showPassengerGoOutOnly && latest.estimated_trip_time != null ? (
                <Text style={styles.meta}>
                  {t("ride_estimated_trip_time")}: {latest.estimated_trip_time} {t("ride_min")}
                </Text>
              ) : null}
              {!showPassengerGoOutOnly && distLine ? <Text style={styles.dist}>{distLine}</Text> : null}
              {!showPassengerGoOutOnly && etaLine ? <Text style={styles.eta}>{etaLine}</Text> : null}

              {st === "in_progress" ? (
                <TouchableOpacity
                  style={styles.resumeTripButton}
                  onPress={() => {
                    const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
                    if (parent) {
                      navigateToRideTripToDestination(parent, latest.id, { showTripSuccessIntro: false });
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="navigate" size={20} color={Colors.textInverse} />
                  <Text style={styles.resumeTripButtonText}>
                    {t("ride_trip_resume_navigation_button")}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {showPassengerCancel ? (
                <TouchableOpacity
                  style={[styles.cancelRequestButton, cancellingPassengerRide && styles.cancelRequestButtonDisabled]}
                  onPress={handleCancelPassengerRide}
                  disabled={cancellingPassengerRide}
                  activeOpacity={0.85}
                >
                  {cancellingPassengerRide ? (
                    <ActivityIndicator color={Colors.danger} />
                  ) : (
                    <Text style={styles.cancelRequestButtonText}>
                      {showPassengerGoOutOnly ? t("ride_passenger_cancel_ride") : t("ride_passenger_cancel_button")}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}

              {st === "arrived" && latest.verification_code ? (
                <View style={styles.codeBox}>
                  <Text style={styles.codeHint}>{t("ride_tracking_share_code_hint")}</Text>
                  <Text style={styles.codeDigits}>{latest.verification_code}</Text>
                  <RideVerificationAttemptHint
                    failedAttempts={latest.verification_failed_attempts ?? 0}
                    labelTwoRemaining={t("ride_verify_attempts_two_remaining")}
                    labelOneRemaining={t("ride_verify_attempts_one_remaining")}
                  />
                </View>
              ) : null}
            </View>
          );
        })()
      ) : (
        <View style={styles.noActiveCard}>
          <Text style={styles.noActiveBanner}>{t("ride_no_active_ride_banner")}</Text>
        </View>
      );

    const historyBlock =
      historyRides.length > 0 ? (
        <View style={styles.historyBlock}>
          <View style={styles.historySectionHeader}>
            <Text style={styles.historySectionTitle}>{t("ride_history_section_title")}</Text>
            <View style={styles.historySectionLine} />
          </View>
          {historyRides.map((h) => {
            const status = feedbackStatuses[h.id];
            const canGiveFeedback = h.status === "completed";
            const rated = !!status?.rated;
            const reported = !!status?.reported;
            return (
              <View key={h.id} style={styles.historyRow}>
                <View style={styles.historyRowTop}>
                  <View style={styles.histAvatar}>
                    <Text style={styles.histAvatarText}>{driverDisplayInitials(h)}</Text>
                  </View>
                  <View style={styles.historyRowMain}>
                    <View style={styles.historyNameRow}>
                      <Text style={styles.historyRowDriver} numberOfLines={1}>
                        {h.driver_full_name} · @{h.driver_username}
                      </Text>
                      <Text style={styles.historyRowDate}>
                        {formatRideRequestTimestamp(h.created_at, locale ?? "he-IL")}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.historyStatusPill,
                        h.status === "completed" && styles.historyStatusPillSuccess,
                        (h.status === "rejected" || h.status === "cancelled") && styles.historyStatusPillDanger,
                      ]}
                    >
                      <Text style={styles.historyStatusPillText}>{t(`ride_status_${h.status}`)}</Text>
                    </View>
                    <Text style={styles.historyRowDest} numberOfLines={2}>
                      {h.destination_text}
                    </Text>
                  </View>
                </View>
                {canGiveFeedback ? (
                  <View style={styles.historyFeedbackRow}>
                    <TouchableOpacity
                      style={[styles.feedbackChip, rated && styles.feedbackChipDone]}
                      onPress={() => openFeedbackForRide(h, "rate")}
                      disabled={rated}
                    >
                      <Ionicons
                        name={rated ? "checkmark-circle" : "star-outline"}
                        size={14}
                        color={rated ? Colors.success : Colors.primary}
                      />
                      <Text
                        style={[
                          styles.feedbackChipText,
                          rated && styles.feedbackChipTextDone,
                        ]}
                      >
                        {rated
                          ? t("ride_rate_done") || "Rated"
                          : t("ride_rate_driver") || "Rate driver"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.feedbackChipReport, reported && styles.feedbackChipDone]}
                      onPress={() => openFeedbackForRide(h, "report")}
                      disabled={reported}
                    >
                      <Ionicons
                        name={reported ? "checkmark-circle" : "flag-outline"}
                        size={14}
                        color={reported ? Colors.success : Colors.danger}
                      />
                      <Text
                        style={[
                          styles.feedbackChipReportText,
                          reported && styles.feedbackChipTextDone,
                        ]}
                      >
                        {reported
                          ? t("ride_report_done") || "Reported"
                          : t("ride_report_driver") || "Report"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null;

    return (
      <Fragment>
        {activeCard}
        {historyBlock}
      </Fragment>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPad }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.centerLoad}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <>
            {userId != null && !loadError ? (
              <>
                <View style={styles.heroCard}>
                  <View style={styles.heroGlow1} />
                  <View style={styles.heroGlow2} />
                  <View style={styles.heroRow}>
                    <View style={styles.heroAvatar}>
                      <Ionicons name="map" size={26} color={Colors.textInverse} />
                    </View>
                    <View style={styles.heroTitles}>
                      <Text style={styles.heroEyebrow}>{t("ride_passenger_hub_eyebrow")}</Text>
                      <Text style={styles.heroTitle}>{t("ride_tracking_title")}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.snapshotBlock}>
                  <Text style={styles.snapshotTitle}>{t("ride_driver_snapshot_label")}</Text>
                  <Text style={styles.snapshotSub}>{t("ride_passenger_rides_caption")}</Text>
                  <View style={styles.statGrid}>
                    {(
                      [
                        { k: "p", v: String(pendingCount), label: t("ride_stat_pending") },
                        { k: "a", v: String(activeCount), label: t("ride_stat_active") },
                        { k: "h", v: String(historyRowCount), label: t("ride_stat_history") },
                        { k: "c", v: String(completedCount), label: t("ride_stat_completed") },
                      ] as const
                    ).map((s) => (
                      <View key={s.k} style={styles.statCard}>
                        <Text style={styles.statValue}>{s.v}</Text>
                        <Text style={styles.statLabel}>{s.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            ) : null}
            {renderBody()}
          </>
        )}
      </ScrollView>
      <RideVerifySuccessModal
        visible={verifySuccessVisible}
        onTimerComplete={onPassengerVerifySuccessTimer}
        title={t("ride_verify_success_title")}
        body={t("ride_verify_success_body")}
      />
      <PostRideFeedbackModal
        visible={!!feedbackTarget}
        target={feedbackTarget}
        initialTab={feedbackInitialTab}
        onClose={() => setFeedbackTarget(null)}
        onRatingSubmitted={() => {
          if (feedbackTarget) {
            const rideId = feedbackTarget.rideRequestId;
            setFeedbackStatuses((prev) => ({
              ...prev,
              [rideId]: {
                rated: true,
                reported: prev[rideId]?.reported ?? false,
              },
            }));
          }
        }}
        onReportSubmitted={() => {
          if (feedbackTarget) {
            const rideId = feedbackTarget.rideRequestId;
            setFeedbackStatuses((prev) => ({
              ...prev,
              [rideId]: {
                rated: prev[rideId]?.rated ?? false,
                reported: true,
              },
            }));
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 8, flexGrow: 1 },
  centerLoad: { minHeight: 200, alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  /** Hero (aligned with driver dashboard) */
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
  sessionCard: {
    alignItems: "center",
    backgroundColor: Colors.warningSoft,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(180, 83, 9, 0.25)",
    marginTop: 4,
  },
  errorCard: {
    alignItems: "center",
    backgroundColor: Colors.dangerSoft,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(185, 28, 28, 0.2)",
    marginTop: 4,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
    ...Shadow.soft,
  },
  empty: {
    textAlign: "center",
    color: Colors.textSecondary,
    marginTop: 12,
    fontSize: Typography.sizeMd,
    lineHeight: 22,
  },
  muted: { textAlign: "center", color: Colors.warning, fontSize: Typography.sizeBase, lineHeight: 20 },
  errorText: { textAlign: "center", color: Colors.danger, fontSize: Typography.sizeBase, lineHeight: 20 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  cardEmphasis: { borderColor: "rgba(15, 91, 99, 0.35)", backgroundColor: Colors.primarySoft, ...Shadow.card },
  activeCardTop: { marginBottom: 10 },
  activeTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 },
  activeSectionLabel: {
    fontSize: Typography.sizeSm,
    fontWeight: Typography.weightBold,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
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
  statusPill: { alignSelf: "flex-start", backgroundColor: Colors.infoSoft, paddingVertical: 4, paddingHorizontal: 10, borderRadius: Radius.pill },
  statusPillText: { fontSize: 12, fontWeight: Typography.weightBold, color: Colors.text, textTransform: "capitalize" },
  driverRow: { flexDirection: "row", alignItems: "center", marginTop: 4, marginBottom: 8, gap: 10 },
  driverAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  driverAvatarText: { color: Colors.textInverse, fontSize: 14, fontWeight: Typography.weightBold },
  driverTextCol: { flex: 1, minWidth: 0 },
  routeBlock: {
    marginTop: 4,
    marginBottom: 4,
    padding: 12,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  routeTextCol: { flex: 1, minWidth: 0 },
  routeKicker: {
    fontSize: 10,
    fontWeight: Typography.weightSemibold,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  noActiveCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.15)",
    ...Shadow.soft,
  },
  noActiveBanner: {
    fontSize: Typography.sizeBase,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  historyBlock: { marginTop: 4, marginBottom: 8 },
  historySectionHeader: { marginTop: 8, marginBottom: 4 },
  historySectionTitle: { fontSize: Typography.sizeLg, fontWeight: Typography.weightBold, color: Colors.text, marginBottom: 6 },
  historySectionLine: { height: 2, borderRadius: 1, backgroundColor: Colors.primarySoft, width: 40 },
  historyRow: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.soft,
  },
  historyRowTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  histAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.2)",
  },
  histAvatarText: { color: Colors.primary, fontSize: 14, fontWeight: Typography.weightBold },
  historyRowMain: { flex: 1, minWidth: 0 },
  historyNameRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 },
  historyRowDate: {
    fontSize: 11,
    color: Colors.textMuted,
    flexShrink: 0,
  },
  historyStatusPill: { alignSelf: "flex-start", backgroundColor: Colors.infoSoft, paddingVertical: 3, paddingHorizontal: 8, borderRadius: Radius.pill, marginBottom: 6 },
  historyStatusPillSuccess: { backgroundColor: Colors.successSoft },
  historyStatusPillDanger: { backgroundColor: Colors.dangerSoft },
  historyStatusPillText: { fontSize: 11, fontWeight: Typography.weightBold, color: Colors.text, textTransform: "capitalize" },
  historyRowDest: {
    fontSize: Typography.sizeBase,
    color: Colors.text,
    lineHeight: 20,
  },
  historyRowDriver: {
    fontSize: Typography.sizeBase,
    fontWeight: Typography.weightSemibold,
    color: Colors.text,
    flex: 1,
    minWidth: 0,
  },
  historyFeedbackRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  feedbackChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.25)",
    backgroundColor: Colors.primarySoft,
  },
  feedbackChipText: { color: Colors.primary, fontWeight: Typography.weightBold, fontSize: 12 },
  feedbackChipReport: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "rgba(197,50,42,0.3)",
    backgroundColor: Colors.dangerSoft,
  },
  feedbackChipReportText: { color: Colors.danger, fontWeight: Typography.weightBold, fontSize: 12 },
  feedbackChipDone: { backgroundColor: Colors.successSoft, borderColor: "rgba(4, 120, 87, 0.25)" },
  feedbackChipTextDone: { color: Colors.success },
  passengerDriverEnRouteBox: {
    backgroundColor: Colors.successSoft,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.2)",
  },
  passengerDriverEnRouteText: {
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
    color: "#166534",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 22,
  },
  followDriverButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    ...Shadow.soft,
  },
  followDriverButtonText: { color: Colors.textInverse, fontSize: Typography.sizeMd, fontWeight: Typography.weightBold, marginStart: 10 },
  resumeTripButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
    ...Shadow.soft,
  },
  resumeTripButtonText: { color: Colors.textInverse, fontSize: Typography.sizeMd, fontWeight: Typography.weightBold, marginStart: 10 },
  passengerGoOutBanner: {
    backgroundColor: Colors.infoSoft,
    borderRadius: Radius.lg,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(29, 78, 216, 0.25)",
  },
  passengerGoOutBannerText: {
    fontSize: Typography.sizeMd,
    fontWeight: Typography.weightBold,
    color: Colors.info,
    textAlign: "center",
    lineHeight: 23,
  },
  phaseLine: { fontSize: Typography.sizeBase, color: Colors.text, marginBottom: 10, lineHeight: 20 },
  driverLine: { fontSize: Typography.sizeBase, color: Colors.text, lineHeight: 20 },
  destLine: { fontSize: Typography.sizeBase, color: Colors.text, marginTop: 2 },
  meta: { fontSize: Typography.sizeSm, color: Colors.textSecondary, marginTop: 6, marginBottom: 2 },
  dist: { fontSize: Typography.sizeSm, color: Colors.textSecondary, marginBottom: 2 },
  eta: { fontSize: Typography.sizeMd, fontWeight: Typography.weightSemibold, color: Colors.text, marginTop: 4 },
  cancelRequestButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    backgroundColor: Colors.surface,
  },
  cancelRequestButtonDisabled: { opacity: 0.55 },
  cancelRequestButtonText: { color: Colors.danger, fontWeight: Typography.weightBold, fontSize: Typography.sizeMd },
  codeBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.25)",
  },
  codeHint: { fontSize: Typography.sizeSm, color: Colors.text, marginBottom: 8, lineHeight: 19 },
  codeDigits: {
    fontSize: 28,
    fontWeight: Typography.weightHeavy,
    letterSpacing: 4,
    color: Colors.primary,
    textAlign: "center",
  },
  passengerVerifyInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(15, 91, 99, 0.35)",
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: Typography.weightSemibold,
    color: Colors.text,
    backgroundColor: Colors.surface,
    textAlign: "center",
  },
  passengerVerifyButton: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    ...Shadow.soft,
  },
  passengerVerifyButtonDisabled: { opacity: 0.55 },
  passengerVerifyButtonText: { color: Colors.textInverse, fontSize: Typography.sizeMd, fontWeight: Typography.weightBold },
});
