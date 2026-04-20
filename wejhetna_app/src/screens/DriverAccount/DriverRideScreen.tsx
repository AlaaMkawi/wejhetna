import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  StyleSheet,
  Switch,
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
import { RIDE_STATUS_POLL_INTERVAL_MS, RIDE_UI_BUILD } from "../../../config";
import { requestCurrentPositionWithRetry } from "../../utils/locationPermission";
import { RideVerificationAttemptHint } from "../../components/ride/RideVerificationAttemptHint";
import { RideVerifySuccessModal } from "../../components/ride/RideVerifySuccessModal";
import { markVerificationMismatchSelfAlert } from "../../utils/rideCancelAlertGate";
import { markTripStartHandledLocally } from "../../utils/rideTripStartPromotionGate";
import {
  navigateToRideTripToDestination,
  navigateToRidePickupNavigation,
  navigateToUserRideRequestsTab,
} from "../../utils/rideNavigateToTripScreen";

const ARRIVING_SOON_ETA_MIN = 3;

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

export default function DriverRideScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const verifySuccessTripIdRef = useRef<number | null>(null);
  const [verifySuccessVisible, setVerifySuccessVisible] = useState(false);
  const [driverUserId, setDriverUserId] = useState<number | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [requests, setRequests] = useState<DriverRideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyActionId, setBusyActionId] = useState<number | null>(null);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  /** Set when ride-requests polling fails; cleared on any successful load (no repeated modals). */
  const [requestsLoadError, setRequestsLoadError] = useState(false);
  /** Short server/network message for on-screen diagnosis (not raw SQL). */
  const [requestsLoadErrorHint, setRequestsLoadErrorHint] = useState<string | null>(null);
  const [verifyCodeByRequestId, setVerifyCodeByRequestId] = useState<Record<number, string>>({});
  /** After arrival at pickup: show wait copy first; after "passenger ready", show existing verify UI. */
  const [driverPassengerReadyForVerifyByRequestId, setDriverPassengerReadyForVerifyByRequestId] = useState<
    Record<number, boolean>
  >({});

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
      setRequestsLoadErrorHint(null);
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
      setRequestsLoadErrorHint(null);
    } catch (e: unknown) {
      setRequestsLoadError(true);
      const raw = e instanceof Error ? e.message : String(e);
      const hint =
        raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
      setRequestsLoadErrorHint(hint || null);
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
          Alert.alert(t("error"), t("failed_to_read_location"), [{ text: t("ok") || "OK" }]);
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
          Alert.alert(t("error"), key ? t(key) : t("ride_failed_update_availability"), [{ text: t("ok") || "OK" }]);
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
          Alert.alert(t("error"), key ? t(key) : t("ride_failed_update_availability"), [{ text: t("ok") || "OK" }]);
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
      Alert.alert(t("error"), key ? t(key) : t("ride_action_failed"), [{ text: t("ok") || "OK" }]);
    } finally {
      setBusyActionId(null);
    }
  };

  const runVerifyCode = async (requestId: number) => {
    if (!driverUserId) return;
    const code = (verifyCodeByRequestId[requestId] ?? "").trim();
    if (code.length < 4) {
      Alert.alert(t("error"), t("ride_verify_code_too_short"), [{ text: t("ok") || "OK" }]);
      return;
    }
    setBusyActionId(requestId);
    try {
      await verifyRideStartCode({
        ride_request_id: requestId,
        driver_user_id: driverUserId,
        verification_code: code,
      });
      setVerifyCodeByRequestId((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      await loadDriverData();
      markTripStartHandledLocally(requestId);
      verifySuccessTripIdRef.current = requestId;
      setVerifySuccessVisible(true);
    } catch (e: unknown) {
      await loadDriverData();
      const msg = e instanceof Error ? e.message : "";
      const key = rideApiDetailToTranslationKey(msg);
      if (key === "ride_error_verify_attempts_exceeded") {
        markVerificationMismatchSelfAlert();
        const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
        Alert.alert(
          t("ride_cancelled_verification_mismatch_title"),
          t("ride_cancelled_verification_mismatch_message"),
          [{ text: t("ok"), onPress: () => parent && navigateToUserRideRequestsTab(parent, "DRIVER") }]
        );
        return;
      }
      Alert.alert(t("error"), key ? t(key) : t("ride_action_failed"), [{ text: t("ok") || "OK" }]);
    } finally {
      setBusyActionId(null);
    }
  };

  const renderActions = (item: DriverRideRequest) => {
    const isBusy = busyActionId === item.id;
    if (item.status === "pending") {
      return (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={() => runRequestAction(item.id, "accept")}
            disabled={isBusy}
          >
            <Text style={styles.actionButtonText}>{t("ride_accept")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => runRequestAction(item.id, "reject")}
            disabled={isBusy}
          >
            <Text style={styles.actionButtonText}>{t("ride_reject")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.status === "accepted") {
      return (
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => runRequestAction(item.id, "start")}
            disabled={isBusy}
          >
            <Text style={styles.actionButtonText}>{t("ride_start_driving_to_customer")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => runRequestAction(item.id, "cancel")}
            disabled={isBusy}
          >
            <Text style={styles.actionButtonText}>{t("ride_cancel")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.status === "on_the_way" || item.status === "driving_to_customer") {
      return (
        <View style={styles.actionColumn}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton, styles.fullWidthBtn]}
            onPress={() => {
              const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
              if (parent) {
                navigateToRidePickupNavigation(parent, item.id);
              }
            }}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Text style={styles.actionButtonText}>
              {t("ride_pickup_resume_navigation_button")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton, styles.fullWidthBtn]}
            onPress={() => runRequestAction(item.id, "cancel")}
            disabled={isBusy}
          >
            <Text style={styles.actionButtonText}>{t("ride_cancel")}</Text>
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
              style={[styles.actionButton, styles.rejectButton, styles.fullWidthBtn]}
              onPress={() => runRequestAction(item.id, "cancel")}
              disabled={isBusy}
              activeOpacity={0.85}
            >
              <Text style={styles.actionButtonText}>{t("ride_cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.primaryButton, styles.fullWidthBtn]}
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
                  Alert.alert(t("error"), key ? t(key) : t("ride_action_failed"), [{ text: t("ok") || "OK" }]);
                } finally {
                  setBusyActionId(null);
                }
              }}
              disabled={isBusy}
              activeOpacity={0.85}
            >
              <Text style={styles.actionButtonText}>{t("ride_driver_passenger_ready_button")}</Text>
            </TouchableOpacity>
          </View>
        );
      }
      const failedAttempts = item.verification_failed_attempts ?? 0;
      return (
        <View style={styles.verifyBlock}>
          <RideVerificationAttemptHint
            failedAttempts={failedAttempts}
            labelTwoRemaining={t("ride_verify_attempts_two_remaining")}
            labelOneRemaining={t("ride_verify_attempts_one_remaining")}
          />
          <TextInput
            style={styles.verifyInput}
            value={verifyCodeByRequestId[item.id] ?? ""}
            onChangeText={(text) =>
              setVerifyCodeByRequestId((prev) => ({ ...prev, [item.id]: text }))
            }
            placeholder={t("ride_verify_code_placeholder")}
            placeholderTextColor="#888"
            keyboardType="number-pad"
            maxLength={16}
            editable={!isBusy}
          />
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton, styles.fullWidthBtn]}
            onPress={() => runVerifyCode(item.id)}
            disabled={isBusy}
          >
            <Text style={styles.actionButtonText}>{t("ride_confirm_code")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton, styles.fullWidthBtn]}
            onPress={() => runRequestAction(item.id, "cancel")}
            disabled={isBusy}
          >
            <Text style={styles.actionButtonText}>{t("ride_cancel")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (item.status === "in_progress") {
      return (
        <View style={styles.actionColumn}>
          <Text style={styles.tripStarted}>{t("ride_driver_trip_in_progress")}</Text>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton, styles.fullWidthBtn]}
            onPress={() => {
              const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
              if (parent) {
                navigateToRideTripToDestination(parent, item.id, { showTripSuccessIntro: false });
              }
            }}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            <Text style={styles.actionButtonText}>{t("ride_trip_resume_navigation_button")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton, styles.fullWidthBtn]}
            onPress={() => runRequestAction(item.id, "cancel")}
            disabled={isBusy}
          >
            <Text style={styles.actionButtonText}>{t("ride_cancel")}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return null;
  };

  const renderItem = ({ item }: { item: DriverRideRequest }) => {
    const phaseKey = driverTrackingPhaseKey(item);
    const hideTrackingPhaseForPickupWait =
      item.status === "arrived" && driverPassengerReadyForVerifyByRequestId[item.id] !== true;
    return (
    <View style={styles.card}>
      <Text style={styles.title}>{item.regular_username}</Text>
      {phaseKey && !hideTrackingPhaseForPickupWait ? (
        <Text style={styles.trackingPhase}>{t(phaseKey)}</Text>
      ) : null}
      <Text style={styles.text}>{t("ride_pickup")}: {item.pickup_lat.toFixed(5)}, {item.pickup_lon.toFixed(5)}</Text>
      <Text style={styles.text}>{t("ride_destination")}: {item.destination_text}</Text>
      <Text style={styles.text}>{t("ride_number_of_people")}: {item.number_of_people ?? item.passengers_count}</Text>
      <Text style={styles.text}>{t("ride_seats_required")}: {item.number_of_seats_required ?? item.passengers_count}</Text>
      {item.distance_to_pickup_km != null ? (
        <Text style={styles.text}>{t("ride_driver_distance_to_user")}: {item.distance_to_pickup_km} {t("ride_km")}</Text>
      ) : null}
      {(item.eta_to_user ?? item.eta_to_pickup_min) != null ? (
        <Text style={styles.text}>{t("ride_eta_to_user")}: {item.eta_to_user ?? item.eta_to_pickup_min} {t("ride_min")}</Text>
      ) : null}
      {item.estimated_trip_time != null ? (
        <Text style={styles.text}>{t("ride_estimated_trip_time")}: {item.estimated_trip_time} {t("ride_min")}</Text>
      ) : null}
      <Text style={styles.statusText}>{t(`ride_status_${item.status}`)}</Text>

      {item.regular_phone ? (
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => Linking.openURL(`tel:${item.regular_phone}`)}
        >
          <Text style={styles.callButtonText}>{t("ride_call_user", { phone: item.regular_phone })}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.hiddenPhoneText}>{t("ride_phone_visible_after_accept")}</Text>
      )}

      {renderActions(item)}
      {busyActionId === item.id ? <ActivityIndicator color="#0f5b63" style={styles.inlineLoader} /> : null}
    </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f5b63" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
    <View style={styles.container}>
      <View style={styles.buildBanner}>
        <Text style={styles.buildBannerText}>{t("ride_ui_version_strip", { tag: RIDE_UI_BUILD })}</Text>
      </View>
      {driverUserId == null ? (
        <View style={styles.sessionWarning}>
          <Text style={styles.sessionWarningText}>{t("ride_session_invalid")}</Text>
        </View>
      ) : (
        <Text style={styles.debugIdLine}>{t("ride_debug_user_id", { id: String(driverUserId) })}</Text>
      )}
      <View style={styles.availabilityCard}>
        <Text style={styles.availabilityLabel}>{t("ride_driver_available_mode")}</Text>
        <Switch
          value={isAvailable}
          onValueChange={onToggleAvailability}
          disabled={updatingAvailability}
          trackColor={{ false: "#c4c4c4", true: "#0f5b63" }}
        />
      </View>
      <Text style={styles.sectionTitle}>{t("ride_incoming_requests")}</Text>
      {requestsLoadError ? (
        <View style={styles.errorBox}>
          <Text style={[styles.loadErrorText, styles.loadErrorTitle]}>{t("ride_failed_load_requests")}</Text>
          {requestsLoadErrorHint ? (
            <Text style={styles.errorHintText}>
              {t("ride_debug_error_hint", { hint: requestsLoadErrorHint })}
            </Text>
          ) : null}
        </View>
      ) : null}
      <FlatList
        data={requests}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        ListEmptyComponent={
          requestsLoadError ? null : (
            <Text style={styles.emptyText}>{t("ride_no_requests")}</Text>
          )
        }
      />
    </View>
    <RideVerifySuccessModal
      visible={verifySuccessVisible}
      onTimerComplete={onVerifySuccessTimer}
      title={t("ride_verify_success_title")}
      body={t("ride_verify_success_body")}
    />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F2F2F7" },
  container: { flex: 1, backgroundColor: "#F2F2F7", paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  buildBanner: {
    backgroundColor: "#0f5b63",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
    alignItems: "center",
  },
  buildBannerText: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
  debugIdLine: { fontSize: 12, color: "#555", marginBottom: 8, textAlign: "center" },
  sessionWarning: {
    backgroundColor: "#fff3cd",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e6d4a8",
  },
  sessionWarningText: { color: "#664d03", fontSize: 13, textAlign: "center", lineHeight: 18 },
  errorBox: { marginBottom: 8 },
  loadErrorTitle: { marginBottom: 4 },
  errorHintText: { color: "#842029", fontSize: 12, marginTop: 6, lineHeight: 17 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  availabilityCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  availabilityLabel: { fontSize: 16, fontWeight: "600", color: "#0f5b63" },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#111", marginBottom: 8 },
  loadErrorText: {
    color: "#842029",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 10,
    paddingHorizontal: 8,
    lineHeight: 20,
  },
  listContent: { paddingBottom: 120 },
  emptyText: { color: "#777", textAlign: "center", marginTop: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#111", marginBottom: 4 },
  trackingPhase: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f5b63",
    marginBottom: 10,
    lineHeight: 20,
  },
  text: { fontSize: 13, color: "#333", marginBottom: 4 },
  statusText: { fontSize: 13, color: "#0f5b63", fontWeight: "700", marginTop: 2, marginBottom: 8 },
  hiddenPhoneText: { color: "#888", fontSize: 12, marginBottom: 8 },
  callButton: {
    backgroundColor: "#eef6f7",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  callButtonText: { color: "#0f5b63", fontWeight: "600" },
  row: { flexDirection: "row", gap: 8 },
  actionColumn: { gap: 10 },
  fullWidthBtn: { flex: 0, width: "100%" },
  waitAtPickupBlock: { gap: 12, marginTop: 4 },
  waitAtPickupTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f5b63",
    textAlign: "center",
  },
  waitAtPickupBody: {
    fontSize: 14,
    color: "#444",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 4,
  },
  verifyBlock: { gap: 10, marginTop: 4 },
  verifyInput: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fafafa",
    color: "#111",
  },
  tripStarted: { fontSize: 14, color: "#198754", fontWeight: "700", marginTop: 4, marginBottom: 10 },
  actionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButton: { backgroundColor: "#0f5b63" },
  acceptButton: { backgroundColor: "#198754" },
  rejectButton: { backgroundColor: "#dc3545" },
  actionButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  inlineLoader: { marginTop: 8 },
});
