import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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
import { RIDE_STATUS_POLL_INTERVAL_MS, RIDE_UI_BUILD } from "../../../config";
import { useDriverToPickupRouteVisualization } from "../../hooks/useDriverToPickupRouteVisualization";
import { markPassengerCancelledOwnRide, markVerificationMismatchSelfAlert } from "../../utils/rideCancelAlertGate";
import { markTripStartHandledLocally } from "../../utils/rideTripStartPromotionGate";
import { RideVerificationAttemptHint } from "../../components/ride/RideVerificationAttemptHint";
import { RideVerifySuccessModal } from "../../components/ride/RideVerifySuccessModal";
import {
  navigateToRideTripToDestination,
  navigateToRidePickupNavigation,
  navigateToUserRideRequestsTab,
} from "../../utils/rideNavigateToTripScreen";

/** ETA at or below this (minutes) shows “arriving soon” copy before “arriving now”. */
const ARRIVING_SOON_ETA_MIN = 3;

function passengerPhaseKey(
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

function hasValidPickup(latest: RegularLatestRideRequest): boolean {
  const la = latest.pickup_lat;
  const lo = latest.pickup_lon;
  return (
    typeof la === "number" &&
    typeof lo === "number" &&
    Number.isFinite(la) &&
    Number.isFinite(lo)
  );
}

function formatRideRequestTimestamp(iso: string, locale: string): string {
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

export default function RegularRideStatusScreen() {
  const { t, i18n } = useTranslation();
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
    Alert.alert(t("ride_passenger_cancel_confirm_title"), t("ride_passenger_cancel_confirm_message"), [
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
            Alert.alert(t("success"), t("ride_passenger_cancel_success"), [{ text: t("ok") }]);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            const key = rideApiDetailToTranslationKey(msg);
            Alert.alert(t("error"), key ? t(key) : msg, [{ text: t("ok") }]);
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
      Alert.alert(t("error"), t("ride_verify_code_too_short"), [{ text: t("ok") }]);
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
        Alert.alert(
          t("ride_cancelled_verification_mismatch_title"),
          t("ride_cancelled_verification_mismatch_message"),
          [{ text: t("ok"), onPress: () => parent && navigateToUserRideRequestsTab(parent, "REGULAR") }]
        );
        return;
      }
      Alert.alert(t("error"), key ? t(key) : msg, [{ text: t("ok") }]);
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
      return <Text style={styles.muted}>{t("ride_session_invalid")}</Text>;
    }
    if (loadError) {
      return <Text style={styles.errorText}>{t("ride_failed_load_requests")}</Text>;
    }
    if (rideList.length === 0) {
      return <Text style={styles.empty}>{t("ride_tracking_empty")}</Text>;
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
          const showPassengerGoOutOnly = st === "arrived" && !passengerVerificationUnlocked;

          const showPassengerDriverFollowBanner =
            hasValidPickup(latest) && (st === "on_the_way" || st === "driving_to_customer");

          return (
            <View style={styles.card}>
              <Text style={styles.activeSectionLabel}>{t("ride_active_ride_section")}</Text>
              <Text style={styles.statusLine}>{t(`ride_status_${st}`)}</Text>
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
                    <Ionicons name="navigate" size={22} color="#fff" />
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
                <Text style={styles.driverLine}>
                  {latest.driver_full_name} · @{latest.driver_username}
                </Text>
              ) : null}
              {!showPassengerGoOutOnly ? <Text style={styles.destLine}>{latest.destination_text}</Text> : null}
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
                  <Ionicons name="navigate" size={20} color="#fff" />
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
                    <ActivityIndicator color="#c62828" />
                  ) : (
                    <Text style={styles.cancelRequestButtonText}>
                      {showPassengerGoOutOnly ? t("ride_passenger_cancel_ride") : t("ride_passenger_cancel_button")}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}

              {st === "arrived" && passengerVerificationUnlocked && latest.verification_code ? (
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
          <Text style={styles.historySectionTitle}>{t("ride_history_section_title")}</Text>
          {historyRides.map((h) => {
            const status = feedbackStatuses[h.id];
            const canGiveFeedback = h.status === "completed";
            const rated = !!status?.rated;
            const reported = !!status?.reported;
            return (
              <View key={h.id} style={styles.historyRow}>
                <Text style={styles.historyRowDate}>{formatRideRequestTimestamp(h.created_at, locale ?? "he-IL")}</Text>
                <Text style={styles.historyRowStatus}>{t(`ride_status_${h.status}`)}</Text>
                <Text style={styles.historyRowDest} numberOfLines={2}>
                  {h.destination_text}
                </Text>
                <Text style={styles.historyRowDriver} numberOfLines={1}>
                  {h.driver_full_name} · @{h.driver_username}
                </Text>
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
                        color={rated ? "#047857" : "#0f5b63"}
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
                        color={reported ? "#047857" : "#c5322a"}
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
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t("ride_tracking_title")}</Text>
        {loading ? (
          <ActivityIndicator color="#0f5b63" style={styles.loader} />
        ) : (
          renderBody()
        )}
        <Text style={styles.build}>{t("ride_ui_version_strip", { tag: RIDE_UI_BUILD })}</Text>
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
  safe: { flex: 1, backgroundColor: "#F2F2F7" },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, paddingTop: 12 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginBottom: 16,
    textAlign: "center",
  },
  loader: { marginTop: 24 },
  empty: {
    textAlign: "center",
    color: "#666",
    marginTop: 32,
    fontSize: 15,
    lineHeight: 22,
  },
  muted: { textAlign: "center", color: "#664d03", marginTop: 16 },
  errorText: { textAlign: "center", color: "#842029", marginTop: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  activeSectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0f5b63",
    marginBottom: 10,
  },
  noActiveCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.15)",
  },
  noActiveBanner: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    lineHeight: 20,
  },
  historyBlock: {
    marginTop: 8,
  },
  historySectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginBottom: 12,
    marginTop: 8,
  },
  historyRow: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  historyRowDate: {
    fontSize: 12,
    color: "#888",
    marginBottom: 6,
  },
  historyRowStatus: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f5b63",
    marginBottom: 6,
  },
  historyRowDest: {
    fontSize: 14,
    color: "#333",
    marginBottom: 4,
    lineHeight: 20,
  },
  historyRowDriver: {
    fontSize: 13,
    color: "#666",
  },
  historyFeedbackRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  feedbackChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.3)",
    backgroundColor: "#e6f2f3",
  },
  feedbackChipText: {
    color: "#0f5b63",
    fontWeight: "700",
    fontSize: 12,
  },
  feedbackChipReport: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(197,50,42,0.3)",
    backgroundColor: "#fde8e6",
  },
  feedbackChipReportText: {
    color: "#c5322a",
    fontWeight: "700",
    fontSize: 12,
  },
  feedbackChipDone: {
    backgroundColor: "#ecfdf5",
    borderColor: "rgba(4,120,87,0.3)",
  },
  feedbackChipTextDone: {
    color: "#047857",
  },
  statusLine: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f5b63",
    marginBottom: 6,
  },
  passengerDriverEnRouteBox: {
    backgroundColor: "#e8f5e9",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.22)",
  },
  passengerDriverEnRouteText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1b5e20",
    textAlign: "center",
    marginBottom: 12,
    lineHeight: 22,
  },
  followDriverButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f5b63",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  followDriverButtonText: { color: "#fff", fontSize: 15, fontWeight: "700", marginLeft: 10 },
  resumeTripButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f5b63",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  resumeTripButtonText: { color: "#fff", fontSize: 15, fontWeight: "700", marginLeft: 10 },
  passengerGoOutBanner: {
    backgroundColor: "#e3f2fd",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(21,101,192,0.35)",
  },
  passengerGoOutBannerText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0d47a1",
    textAlign: "center",
    lineHeight: 23,
  },
  phaseLine: {
    fontSize: 14,
    color: "#333",
    marginBottom: 10,
    lineHeight: 20,
  },
  driverLine: { fontSize: 15, color: "#222", marginBottom: 6 },
  destLine: { fontSize: 14, color: "#444", marginBottom: 8 },
  meta: { fontSize: 13, color: "#555", marginBottom: 4 },
  dist: { fontSize: 13, color: "#444", marginBottom: 4 },
  eta: { fontSize: 15, fontWeight: "600", color: "#111", marginTop: 4 },
  cancelRequestButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#c62828",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  cancelRequestButtonDisabled: {
    opacity: 0.55,
  },
  cancelRequestButtonText: {
    color: "#c62828",
    fontWeight: "700",
    fontSize: 15,
  },
  codeBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#eef6f7",
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.25)",
  },
  codeHint: { fontSize: 13, color: "#333", marginBottom: 8, lineHeight: 19 },
  codeDigits: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 4,
    color: "#0f5b63",
    textAlign: "center",
  },
  passengerVerifyInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.35)",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: "600",
    color: "#111",
    backgroundColor: "#fff",
    textAlign: "center",
  },
  passengerVerifyButton: {
    marginTop: 12,
    backgroundColor: "#0f5b63",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  passengerVerifyButtonDisabled: { opacity: 0.55 },
  passengerVerifyButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  build: { fontSize: 11, color: "#999", textAlign: "center", marginTop: 28 },
});
