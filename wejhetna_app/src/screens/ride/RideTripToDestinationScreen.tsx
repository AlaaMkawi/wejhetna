import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera, PointAnnotation, ShapeSource, LineLayer } from "@maplibre/maplibre-react-native";
import { FocusedMapView } from "../../components/map/FocusedMapView";
import { useMapScreenLifecycle } from "../../components/map/useMapScreenLifecycle";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../../navigation/types";
import { openDrivingRoutePreview } from "../../navigation/openDrivingRoutePreview";
import {
  DriverRideRequest,
  getDriverRideRequests,
  getRegularLatestRideRequest,
  parseStoredUserId,
  RegularLatestRideRequest,
  normalizeRideRequestStatus,
  updateDriverLocation,
} from "../../api/rides";
import { requestCurrentPositionWithRetry } from "../../utils/locationPermission";
import { RideDriverMapMarker } from "../../components/map/RideDriverMapMarker";
import { RouteEndpointMarker } from "../../components/map/RouteEndpointMarker";
import { OffRoutePathConnector } from "../../components/map/OffRoutePathConnector";
import { useDriverTrailHeading } from "../../components/map/useDriverTrailHeading";
import { useDriverToPickupRouteVisualization } from "../../hooks/useDriverToPickupRouteVisualization";
import { RideDestinationDetailsModal } from "../../components/ride/RideDestinationDetailsModal";
import { navigateToUserRideRequestsTab } from "../../utils/rideNavigateToTripScreen";
import { NavigationInfoPanel, type NavInfoStat } from "../../components/navigation/NavigationInfoPanel";
import i18n from "../../i18n";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";
const NEGEV_BOUNDS = {
  ne: [35.1, 31.42] as [number, number],
  sw: [34.72, 31.18] as [number, number],
};
const TEAL = "#0f5b63";
const ROUTE_BLUE = "#1565c0";
const ROUTE_BACKDROP = "rgba(21, 101, 192, 0.28)";
const TRIP_POLL_MS = 3000;

type Props = NativeStackScreenProps<RootStackParamList, "RideTripToDestination">;

export default function RideTripToDestinationScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { rideRequestId } = route.params;

  const [role, setRole] = useState<"DRIVER" | "REGULAR" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rideDriver, setRideDriver] = useState<DriverRideRequest | null>(null);
  const [ridePassenger, setRidePassenger] = useState<RegularLatestRideRequest | null>(null);
  const [myDriverGps, setMyDriverGps] = useState<{ lat: number; lon: number } | null>(null);
  const [driverUserId, setDriverUserId] = useState<number | null>(null);
  const [destModalOpen, setDestModalOpen] = useState(false);
  const [navRouteLoading, setNavRouteLoading] = useState(false);
  const launchedNavRef = useRef(false);
  const myDriverGpsRef = useRef(myDriverGps);
  myDriverGpsRef.current = myDriverGps;
  const { showOverlays, exitMapScreen } = useMapScreenLifecycle();

  const fetchSnapshot = useCallback(async () => {
    setError(null);
    try {
      const r = await AsyncStorage.getItem("userRole");
      setRole(r === "DRIVER" ? "DRIVER" : "REGULAR");
      if (r === "DRIVER") {
        const stored = await AsyncStorage.getItem("userId");
        const did = parseStoredUserId(stored);
        if (did == null) {
          setError("session");
          return;
        }
        setDriverUserId(did);
        const list = await getDriverRideRequests(did);
        setRideDriver(list.find((x) => x.id === rideRequestId) ?? null);
        setRidePassenger(null);
      } else {
        const stored = await AsyncStorage.getItem("userId");
        const uid = parseStoredUserId(stored);
        if (uid == null) {
          setError("session");
          return;
        }
        const row = await getRegularLatestRideRequest(uid);
        setRidePassenger(row?.id === rideRequestId ? row : null);
        setRideDriver(null);
      }
    } catch {
      setError("load");
    } finally {
      setLoading(false);
    }
  }, [rideRequestId]);

  useEffect(() => {
    void fetchSnapshot();
    const id = setInterval(() => void fetchSnapshot(), TRIP_POLL_MS);
    return () => clearInterval(id);
  }, [fetchSnapshot]);

  useEffect(() => {
    if (role !== "DRIVER") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const pos = await requestCurrentPositionWithRetry();
        if (!cancelled) {
          setMyDriverGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        }
      } catch {
        /* keep last */
      }
    };
    void tick();
    const interval = setInterval(tick, 2800);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [role]);

  useEffect(() => {
    if (driverUserId == null) return;
    const tick = () => {
      const g = myDriverGpsRef.current;
      if (!g) return;
      void updateDriverLocation({ driver_user_id: driverUserId, lat: g.lat, lon: g.lon });
    };
    void tick();
    const interval = setInterval(tick, 8000);
    return () => clearInterval(interval);
  }, [driverUserId]);

  const ride = role === "DRIVER" ? rideDriver : role === "REGULAR" ? ridePassenger : null;
  const destination = useMemo(() => {
    if (!ride || ride.destination_lat == null || ride.destination_lon == null) return null;
    if (!Number.isFinite(ride.destination_lat) || !Number.isFinite(ride.destination_lon)) return null;
    return { lat: ride.destination_lat, lon: ride.destination_lon };
  }, [ride]);

  const pickup = useMemo(() => {
    if (!ride || ride.pickup_lat == null || ride.pickup_lon == null) return null;
    if (!Number.isFinite(ride.pickup_lat) || !Number.isFinite(ride.pickup_lon)) return null;
    return { lat: ride.pickup_lat, lon: ride.pickup_lon };
  }, [ride]);

  const driverDot = useMemo(() => {
    if (role === "DRIVER") {
      return myDriverGps;
    }
    const r = ridePassenger;
    if (
      r?.driver_live_lat != null &&
      r?.driver_live_lon != null &&
      Number.isFinite(r.driver_live_lat) &&
      Number.isFinite(r.driver_live_lon)
    ) {
      return { lat: r.driver_live_lat, lon: r.driver_live_lon };
    }
    return null;
  }, [role, myDriverGps, ridePassenger]);

  const {
    routeBackdropFc,
    routeRemainingFc,
    remainingDistanceMeters,
    etaSecondsRemaining,
    routeLoading,
    osrmLegDistanceM,
  } = useDriverToPickupRouteVisualization(driverDot, destination);

  const driverTrailHeadingDeg = useDriverTrailHeading(driverDot?.lat, driverDot?.lon, 6);

  /**
   * First coordinate of the trimmed remaining route — used as the target of
   * the dotted off-road connector and the small "start of road" dot, so the
   * trip route reads consistently with the pickup-route visual.
   */
  const routeRemainingStart = useMemo<[number, number] | null>(() => {
    const coords = routeRemainingFc?.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length === 0) return null;
    const [lon, lat] = coords[0] as [number, number];
    if (typeof lon !== "number" || typeof lat !== "number") return null;
    return [lon, lat];
  }, [routeRemainingFc]);

  const etaLine = useMemo(() => {
    if (etaSecondsRemaining != null && Number.isFinite(etaSecondsRemaining)) {
      if (etaSecondsRemaining < 90) {
        return t("ride_tracking_passenger_eta_seconds", {
          seconds: Math.max(1, Math.round(etaSecondsRemaining)),
        });
      }
      const min = Math.max(1, Math.round(etaSecondsRemaining / 60));
      if (min <= 1) return t("ride_driver_eta_arriving_now");
      return t("ride_driver_eta_minutes_away", { minutes: min });
    }
    return null;
  }, [etaSecondsRemaining, t]);

  const distKm = useMemo(() => {
    if (remainingDistanceMeters != null && Number.isFinite(remainingDistanceMeters)) {
      return Math.round((remainingDistanceMeters / 1000) * 10) / 10;
    }
    return null;
  }, [remainingDistanceMeters]);

  const legProgress = useMemo(() => {
    if (osrmLegDistanceM == null || osrmLegDistanceM <= 0 || remainingDistanceMeters == null) return 0;
    return Math.max(0, Math.min(1, 1 - remainingDistanceMeters / osrmLegDistanceM));
  }, [osrmLegDistanceM, remainingDistanceMeters]);

  const arrivalClock = useMemo(() => {
    if (etaSecondsRemaining == null || !Number.isFinite(etaSecondsRemaining)) return null;
    const locale = i18n.language === "he" ? "he-IL" : "ar";
    return new Date(Date.now() + etaSecondsRemaining * 1000).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [etaSecondsRemaining]);

  const tripNavStats = useMemo((): [NavInfoStat, NavInfoStat, NavInfoStat] => {
    const distLabel = t("distance");
    return [
      {
        label: t("ride_tracking_passenger_live_eta_label"),
        value: etaLine ?? t("ride_tracking_eta_pending"),
        icon: "time-outline",
        highlight: true,
        valueFlexible: true,
      },
      {
        label: distLabel,
        value:
          distKm != null
            ? t("ride_trip_distance_remaining_km", { km: distKm })
            : t("ride_tracking_distance_pending"),
        icon: "navigate-outline",
        valueFlexible: true,
      },
      {
        label: t("eta_arrival"),
        value: arrivalClock ?? "—",
        icon: "location-outline",
      },
    ];
  }, [t, etaLine, distKm, arrivalClock]);

  const cameraSettings = useMemo(() => {
    if (!destination) return null;
    if (driverDot) {
      return {
        centerCoordinate: [driverDot.lon, driverDot.lat] as [number, number],
        zoomLevel: 14.8,
      };
    }
    return {
      centerCoordinate: [destination.lon, destination.lat] as [number, number],
      zoomLevel: 12.5,
    };
  }, [destination, driverDot]);

  const cameraKey = useMemo(() => {
    if (!cameraSettings) return "c";
    const d = driverDot;
    return `t-${cameraSettings.centerCoordinate[0]}-${d?.lat ?? "x"}`;
  }, [cameraSettings, driverDot]);

  const navigateOut = useCallback(() => {
    const go = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      navigateToUserRideRequestsTab(navigation, role ?? "REGULAR");
    };
    exitMapScreen(go);
  }, [navigation, role, exitMapScreen]);

  const stOk =
    ride &&
    normalizeRideRequestStatus(
      role === "DRIVER" ? (ride as DriverRideRequest).status : (ride as RegularLatestRideRequest).status
    ) === "in_progress";

  const rd = ride as DriverRideRequest | null;
  const rp = ride as RegularLatestRideRequest | null;
  const driverPhone = role === "DRIVER" ? rd?.driver_phone ?? null : rp?.driver_phone ?? null;
  const passengerPhone = role === "DRIVER" ? rd?.regular_phone ?? null : rp?.regular_phone ?? null;

  useEffect(() => {
    if (launchedNavRef.current) return;
    if (!role || !ride || !stOk || !destination || !pickup) return;
    launchedNavRef.current = true;

    const driverName =
      role === "DRIVER"
        ? t("ride_trip_you_marker")
        : rp?.driver_full_name
          ? `${rp.driver_full_name} · @${rp.driver_username}`
          : `@${rp?.driver_username ?? ""}`;
    const passengerName =
      role === "DRIVER"
        ? rd?.regular_full_name?.trim()
          ? `${rd.regular_full_name.trim()} (@${rd.regular_username})`
          : `@${rd?.regular_username ?? ""}`
        : t("ride_trip_you_marker");

    void openDrivingRoutePreview({
      navigation: {
        // Replace so we don't bounce back into this screen and re-open navigation.
        navigate: (_name, params) =>
          exitMapScreen(() => navigation.replace("RouteDetails", params)),
      },
      destination: { ...destination, name: ride.destination_text || undefined },
      t,
      setRouteLoading: setNavRouteLoading,
      // IMPORTANT: initial OSRM origin must be the ride pickup point (where driver picked the passenger).
      originOverride: pickup,
      navigationPhase: "active",
      routeDetailsExtras: {
        rideContext: {
          rideRequestId,
          destinationText: ride.destination_text ?? "",
          destinationLat: destination.lat,
          destinationLon: destination.lon,
          driverName,
          driverPhone,
          passengerName,
          passengerPhone,
          role,
        },
      },
    }).catch(() => {
      // openDrivingRoutePreview already shows alerts; allow retry by going back.
      launchedNavRef.current = false;
    });
  }, [destination, driverPhone, exitMapScreen, navigation, passengerPhone, pickup, rd, ride, rideRequestId, role, rp, stOk, t]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={navigateOut} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={28} color={TEAL} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {t("ride_trip_to_destination_title")}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading || (ride && stOk && destination && pickup) ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : error === "session" ? (
        <Text style={styles.err}>{t("ride_session_invalid")}</Text>
      ) : !ride || !stOk ? (
        <Text style={styles.err}>{t("ride_trip_invalid_state")}</Text>
      ) : !destination ? (
        <Text style={styles.err}>{t("ride_trip_no_destination_coords")}</Text>
      ) : (
        <>
          <View style={styles.mapWrap}>
            <FocusedMapView
              style={styles.map}
              mapStyle={MAP_STYLE_URL}
              scrollEnabled
              rotateEnabled
              pitchEnabled={false}
              logoEnabled={false}
              attributionEnabled={false}
            >
              {cameraSettings ? (
                <Camera
                  key={cameraKey}
                  defaultSettings={{
                    centerCoordinate: cameraSettings.centerCoordinate,
                    zoomLevel: cameraSettings.zoomLevel,
                  }}
                  maxBounds={NEGEV_BOUNDS}
                  minZoomLevel={9}
                  maxZoomLevel={18}
                  animationMode="flyTo"
                />
              ) : null}
              {showOverlays && routeBackdropFc ? (
                <ShapeSource id="tripRouteBackdrop" shape={routeBackdropFc}>
                  <LineLayer
                    id="tripRouteBackdropLayer"
                    style={{
                      lineColor: ROUTE_BACKDROP,
                      lineWidth: 7,
                      lineOpacity: 1,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </ShapeSource>
              ) : null}
              {showOverlays && routeRemainingFc ? (
                <ShapeSource id="tripRouteRemaining" shape={routeRemainingFc}>
                  <LineLayer
                    id="tripRouteRemainingLayer"
                    style={{
                      lineColor: ROUTE_BLUE,
                      lineWidth: 5,
                      lineOpacity: 0.95,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </ShapeSource>
              ) : null}
              {/* Dotted leader line from the live driver dot to the start of
                  the remaining road route — keeps the trip flow visually
                  consistent with the pickup tracking flow. */}
              {showOverlays ? (
                <OffRoutePathConnector
                  id="tripRouteConnector"
                  from={driverDot}
                  to={routeRemainingStart}
                  color={ROUTE_BLUE}
                  width={3}
                />
              ) : null}
              {showOverlays && routeRemainingStart ? (
                <PointAnnotation
                  id="tripRouteStart"
                  coordinate={routeRemainingStart}
                >
                  <RouteEndpointMarker variant="start" color={ROUTE_BLUE} />
                </PointAnnotation>
              ) : null}
              {showOverlays ? (
                <PointAnnotation
                  id="dest_mark"
                  coordinate={[destination.lon, destination.lat]}
                >
                  <RouteEndpointMarker variant="end" iconName="flag" />
                </PointAnnotation>
              ) : null}
              {showOverlays && driverDot ? (
                <PointAnnotation id="driver_trip" coordinate={[driverDot.lon, driverDot.lat]}>
                  <RideDriverMapMarker size="expanded" headingDeg={driverTrailHeadingDeg} vehicleIcon="car" />
                </PointAnnotation>
              ) : null}
            </FocusedMapView>
            {routeLoading ? (
              <View style={styles.routeLoading}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.routeLoadingText}>{t("ride_tracking_route_loading")}</Text>
              </View>
            ) : null}
          </View>

          <NavigationInfoPanel
            accentColor={TEAL}
            isLive
            showLiveDot
            liveLabel={t("ride_trip_live_progress_title")}
            stats={tripNavStats}
            progress={legProgress}
            showProgress={Boolean(
              osrmLegDistanceM != null && osrmLegDistanceM > 0 && remainingDistanceMeters != null
            )}
            startLabel={t("ride_trip_label_driver")}
            endLabel={t("ride_destination")}
            style={styles.tripNavPanel}
          >
            <View style={styles.participants}>
              <Text style={styles.participantsTitle}>{t("ride_trip_participants_title")}</Text>
              {role === "DRIVER" && rd ? (
                <>
                  <Text style={styles.participantLine}>
                    {t("ride_trip_label_driver")}: {t("ride_trip_you_marker")}
                  </Text>
                  {driverPhone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${driverPhone}`)}>
                      <Text style={styles.phoneLink}>
                        {t("ride_trip_driver_phone")}: {driverPhone}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <Text style={styles.participantLine}>
                    {t("ride_trip_label_passenger")}:{" "}
                    {rd.regular_full_name?.trim()
                      ? `${rd.regular_full_name.trim()} (@${rd.regular_username})`
                      : `@${rd.regular_username}`}
                  </Text>
                  {passengerPhone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${passengerPhone}`)}>
                      <Text style={styles.phoneLink}>
                        {t("ride_trip_passenger_phone")}: {passengerPhone}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : rp ? (
                <>
                  <Text style={styles.participantLine}>
                    {t("ride_trip_label_driver")}: {rp.driver_full_name} · @{rp.driver_username}
                  </Text>
                  {driverPhone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${driverPhone}`)}>
                      <Text style={styles.phoneLink}>
                        {t("ride_trip_driver_phone")}: {driverPhone}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.tripPanelMuted}>{t("ride_trip_phone_hidden")}</Text>
                  )}
                  <Text style={styles.participantLine}>
                    {t("ride_trip_label_passenger")}: {t("ride_trip_you_marker")}
                  </Text>
                  {passengerPhone ? (
                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${passengerPhone}`)}>
                      <Text style={styles.phoneLink}>
                        {t("ride_trip_passenger_phone")}: {passengerPhone}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}
            </View>
            <TouchableOpacity style={styles.destBtn} onPress={() => setDestModalOpen(true)} activeOpacity={0.85}>
              <Ionicons name="information-circle-outline" size={22} color="#fff" />
              <Text style={styles.destBtnText}>{t("ride_trip_destination_details_button")}</Text>
            </TouchableOpacity>
          </NavigationInfoPanel>
        </>
      )}

      <RideDestinationDetailsModal
        visible={destModalOpen}
        onClose={() => setDestModalOpen(false)}
        destinationText={ride?.destination_text ?? ""}
        destinationLat={destination?.lat ?? null}
        destinationLon={destination?.lon ?? null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F2F2F7" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#111", textAlign: "center" },
  mapWrap: { flex: 1, position: "relative" },
  map: { flex: 1 },
  routeLoading: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,91,99,0.92)",
    paddingVertical: 10,
    borderRadius: 10,
  },
  routeLoadingText: { color: "#fff", fontSize: 13, fontWeight: "600", marginLeft: 10 },
  tripNavPanel: {
    borderTopWidth: 0,
  },
  tripPanelMuted: { fontSize: 13, color: "#777", marginTop: 4 },
  participants: { marginTop: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E8EDF0" },
  participantsTitle: { fontSize: 14, fontWeight: "700", color: "#111", marginBottom: 8 },
  participantLine: { fontSize: 14, color: "#333", marginBottom: 4 },
  phoneLink: { fontSize: 14, fontWeight: "600", color: "#1565c0", marginBottom: 6, textDecorationLine: "underline" },
  destBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: TEAL,
    marginTop: 14,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  destBtnText: { color: "#fff", fontWeight: "700", fontSize: 15, marginLeft: 8 },
  markerDest: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#c62828",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  err: { textAlign: "center", color: "#842029", padding: 20 },
});
