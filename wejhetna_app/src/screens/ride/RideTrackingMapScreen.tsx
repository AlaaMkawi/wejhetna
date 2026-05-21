import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appAlert } from "../../utils/appAlert";
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { CommonActions } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Camera, PointAnnotation, ShapeSource, LineLayer } from "@maplibre/maplibre-react-native";
import { FocusedMapView } from "../../components/map/FocusedMapView";
import { useMapScreenLifecycle } from "../../components/map/useMapScreenLifecycle";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../../navigation/types";
import {
  cancelRideRequest,
  getDriverRideRequests,
  getRegularLatestRideRequest,
  markRideArrived,
  parseStoredUserId,
  RegularLatestRideRequest,
  DriverRideRequest,
  normalizeRideRequestStatus,
  updateDriverLocation,
} from "../../api/rides";
import { RIDE_STATUS_POLL_INTERVAL_MS } from "../../../config";
import { requestCurrentPositionWithRetry } from "../../utils/locationPermission";
import { RideDriverMapMarker } from "../../components/map/RideDriverMapMarker";
import { RouteEndpointMarker } from "../../components/map/RouteEndpointMarker";
import { OffRoutePathConnector } from "../../components/map/OffRoutePathConnector";
import { useDriverTrailHeading } from "../../components/map/useDriverTrailHeading";
import { useDriverToPickupRouteVisualization } from "../../hooks/useDriverToPickupRouteVisualization";
import { haversineMeters } from "../../utils/routePolyline";
import {
  isPickupArrivalStatus,
  navDistanceKmFromMeters,
  navEtaMinutesFromSeconds,
  navEtaSecondsForDisplay,
  navRemainingMeters,
  shouldLockNavMetricsForProximity,
} from "../../utils/navMetricsAtArrival";
import { markDriverCancelledOwnRide } from "../../utils/rideCancelAlertGate";
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

/** Auto “arrived at pickup” when straight-line or remaining route distance is within this range. */
const DRIVER_PICKUP_ARRIVAL_HAVERSINE_M = 58;
const DRIVER_PICKUP_ARRIVAL_REMAINING_ROUTE_M = 52;

/** Faster ride snapshot on full-screen map so positions + live ETA track movement. */
const FULL_MAP_POLL_INTERVAL_MS = 3000;

type Props = NativeStackScreenProps<RootStackParamList, "RideTrackingMap">;

export default function RideTrackingMapScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { mode, rideRequestId } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rideDriver, setRideDriver] = useState<DriverRideRequest | null>(null);
  const [ridePassenger, setRidePassenger] = useState<RegularLatestRideRequest | null>(null);
  const [myDriverGps, setMyDriverGps] = useState<{ lat: number; lon: number } | null>(null);
  const [driverUserId, setDriverUserId] = useState<number | null>(null);
  const [driverCancellingRide, setDriverCancellingRide] = useState(false);

  /** After auto-arrival (or server already arrived), close map once and return to driver requests list. */
  const exitedDriverMapAfterArrivalRef = useRef(false);
  /** Passenger: when driver reaches pickup, return to transport / status tab once. */
  const exitedPassengerMapAfterArrivalRef = useRef(false);
  const markArrivalRequestInFlightRef = useRef(false);
  const myDriverGpsRef = useRef(myDriverGps);
  myDriverGpsRef.current = myDriverGps;
  const { showOverlays, exitMapScreen, screenActiveRef } = useMapScreenLifecycle();

  const pickup = useMemo(() => {
    const r = mode === "driver" ? rideDriver : ridePassenger;
    if (!r || typeof r.pickup_lat !== "number" || typeof r.pickup_lon !== "number") {
      return null;
    }
    return { lat: r.pickup_lat, lon: r.pickup_lon };
  }, [mode, rideDriver, ridePassenger]);

  const driverDot = useMemo(() => {
    if (mode === "driver") {
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
  }, [mode, myDriverGps, ridePassenger]);

  const rideForPickup = mode === "driver" ? rideDriver : ridePassenger;
  const pickupArrivalReached = useMemo(() => {
    if (!rideForPickup || rideForPickup.id !== rideRequestId) return false;
    const st = normalizeRideRequestStatus(rideForPickup.status);
    if (isPickupArrivalStatus(st)) return true;
    if (mode !== "driver" || !driverDot || !pickup) return false;
    if (st !== "on_the_way" && st !== "driving_to_customer") return false;
    return (
      haversineMeters(driverDot.lat, driverDot.lon, pickup.lat, pickup.lon) <=
      DRIVER_PICKUP_ARRIVAL_HAVERSINE_M
    );
  }, [rideForPickup, rideRequestId, mode, driverDot, pickup]);

  const {
    routeBackdropFc,
    routeRemainingFc,
    remainingDistanceMeters,
    etaSecondsRemaining,
    routeLoading,
    osrmLegDistanceM,
  } = useDriverToPickupRouteVisualization(driverDot, pickup, {
    forceZeroMetrics: pickupArrivalReached,
  });

  const pickupProximityLock = useMemo(() => {
    if (!pickup || !driverDot) return false;
    return shouldLockNavMetricsForProximity(
      remainingDistanceMeters ?? Number.POSITIVE_INFINITY,
      haversineMeters(driverDot.lat, driverDot.lon, pickup.lat, pickup.lon)
    );
  }, [pickup, driverDot, remainingDistanceMeters]);

  const atPickupArrival = pickupArrivalReached || pickupProximityLock;
  const pickupNavLockOpts = useMemo(() => ({ atArrival: atPickupArrival }), [atPickupArrival]);

  const driverTrailHeadingDeg = useDriverTrailHeading(
    driverDot?.lat,
    driverDot?.lon,
    6
  );

  /**
   * First coordinate of the trimmed remaining route — used as the target of
   * the dotted off-road connector and the small "start of road" dot.
   */
  const routeRemainingStart = useMemo<[number, number] | null>(() => {
    const coords = routeRemainingFc?.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length === 0) return null;
    const [lon, lat] = coords[0] as [number, number];
    if (typeof lon !== "number" || typeof lat !== "number") return null;
    return [lon, lat];
  }, [routeRemainingFc]);

  const statusStr = useMemo(() => {
    if (mode === "driver" && rideDriver) {
      return normalizeRideRequestStatus(rideDriver.status);
    }
    if (mode === "passenger" && ridePassenger) {
      return normalizeRideRequestStatus(ridePassenger.status);
    }
    return "pending" as const;
  }, [mode, rideDriver, ridePassenger]);

  const apiEtaMin = mode === "passenger" ? ridePassenger?.eta_to_user ?? null : rideDriver?.eta_to_pickup_min ?? rideDriver?.eta_to_user ?? null;
  const apiDistKm = mode === "passenger" ? ridePassenger?.distance_to_pickup_km ?? null : rideDriver?.distance_to_pickup_km ?? null;

  const fetchRideSnapshot = useCallback(async () => {
    if (!screenActiveRef.current) {
      return;
    }
    setError(null);
    try {
      if (mode === "driver") {
        const stored = await AsyncStorage.getItem("userId");
        const did = parseStoredUserId(stored);
        if (did == null) {
          if (screenActiveRef.current) {
            setError("session");
            setRideDriver(null);
            setDriverUserId(null);
          }
          return;
        }
        if (screenActiveRef.current) {
          setDriverUserId(did);
        }
        const list = await getDriverRideRequests(did);
        const row = list.find((x) => x.id === rideRequestId) ?? null;
        if (screenActiveRef.current) {
          setRideDriver(row);
        }
      } else {
        const stored = await AsyncStorage.getItem("userId");
        const uid = parseStoredUserId(stored);
        if (uid == null) {
          if (screenActiveRef.current) {
            setError("session");
            setRidePassenger(null);
          }
          return;
        }
        const row = await getRegularLatestRideRequest(uid);
        if (screenActiveRef.current) {
          setRidePassenger(row);
        }
      }
    } catch {
      if (screenActiveRef.current) {
        setError("load");
      }
    } finally {
      if (screenActiveRef.current) {
        setLoading(false);
      }
    }
  }, [mode, rideRequestId, screenActiveRef]);

  useEffect(() => {
    void fetchRideSnapshot();
    const pollMs =
      mode === "passenger" || mode === "driver" ? FULL_MAP_POLL_INTERVAL_MS : RIDE_STATUS_POLL_INTERVAL_MS;
    const id = setInterval(() => {
      void fetchRideSnapshot();
    }, pollMs);
    return () => clearInterval(id);
  }, [fetchRideSnapshot, mode]);

  /** Driver: live GPS — same interval family as ride status polling (see config). */
  useEffect(() => {
    if (mode !== "driver") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const pos = await requestCurrentPositionWithRetry();
        if (!cancelled && screenActiveRef.current) {
          setMyDriverGps({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        }
      } catch {
        /* keep last fix */
      }
    };
    void tick();
    const interval = setInterval(tick, 2800);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mode]);

  const navigateDriverOutToRequests = useCallback(() => {
    const go = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      navigation.dispatch(
        CommonActions.navigate({
          name: "UserTabs",
          params: {
            screen: "DriverRequests",
          },
        })
      );
    };
    exitMapScreen(go);
  }, [navigation, exitMapScreen]);

  const exitDriverMapAfterArrival = useCallback(() => {
    if (exitedDriverMapAfterArrivalRef.current) return;
    exitedDriverMapAfterArrivalRef.current = true;
    navigateDriverOutToRequests();
  }, [navigateDriverOutToRequests]);

  /** Passenger: leave full-screen map — prefer stack back; otherwise open transport tab (ride requests). */
  const navigatePassengerOutOfMapToRideRequests = useCallback(() => {
    const go = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      navigation.dispatch(
        CommonActions.navigate({
          name: "UserTabs",
          params: {
            screen: "RideTracking",
          },
        })
      );
    };
    exitMapScreen(go);
  }, [navigation, exitMapScreen]);

  const exitPassengerMapAfterArrival = useCallback(() => {
    if (exitedPassengerMapAfterArrivalRef.current) return;
    exitedPassengerMapAfterArrivalRef.current = true;
    navigatePassengerOutOfMapToRideRequests();
  }, [navigatePassengerOutOfMapToRideRequests]);

  /** Passenger on live map: driver marked arrived → back to ride status screen (go-out / OTP flow). */
  useEffect(() => {
    if (mode !== "passenger" || exitedPassengerMapAfterArrivalRef.current) return;
    if (!ridePassenger || ridePassenger.id !== rideRequestId) return;
    if (normalizeRideRequestStatus(ridePassenger.status) === "arrived") {
      exitPassengerMapAfterArrival();
    }
  }, [mode, ridePassenger, rideRequestId, exitPassengerMapAfterArrival]);

  /** Keep server driver location updated while on navigation map (same idea as driver tab). */
  useEffect(() => {
    if (mode !== "driver" || driverUserId == null) return;
    const tick = () => {
      const g = myDriverGpsRef.current;
      if (!g) return;
      void updateDriverLocation({
        driver_user_id: driverUserId,
        lat: g.lat,
        lon: g.lon,
      });
    };
    void tick();
    const interval = setInterval(tick, 8000);
    return () => clearInterval(interval);
  }, [mode, driverUserId]);

  /** Driver already marked arrived (e.g. reopened map) → back to requests list. */
  useEffect(() => {
    if (mode !== "driver" || exitedDriverMapAfterArrivalRef.current) return;
    if (!rideDriver || rideDriver.id !== rideRequestId) return;
    if (normalizeRideRequestStatus(rideDriver.status) === "arrived") {
      exitDriverMapAfterArrival();
    }
  }, [mode, rideDriver, rideRequestId, exitDriverMapAfterArrival]);

  /** Auto arrival at pickup: live route remaining distance + GPS; then mark arrived on server. */
  useEffect(() => {
    if (mode !== "driver" || exitedDriverMapAfterArrivalRef.current) return;
    if (driverUserId == null || !rideDriver || rideDriver.id !== rideRequestId) return;
    const st = normalizeRideRequestStatus(rideDriver.status);
    if (st === "arrived") {
      return;
    }
    if (st !== "on_the_way" && st !== "driving_to_customer") {
      return;
    }
    if (!driverDot || !pickup) return;
    const h = haversineMeters(driverDot.lat, driverDot.lon, pickup.lat, pickup.lon);
    const closeEnough =
      (remainingDistanceMeters != null && remainingDistanceMeters <= DRIVER_PICKUP_ARRIVAL_REMAINING_ROUTE_M) ||
      h <= DRIVER_PICKUP_ARRIVAL_HAVERSINE_M;
    if (!closeEnough || markArrivalRequestInFlightRef.current) return;

    markArrivalRequestInFlightRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await markRideArrived(rideRequestId, driverUserId);
        if (cancelled) {
          markArrivalRequestInFlightRef.current = false;
          return;
        }
        await fetchRideSnapshot();
        exitDriverMapAfterArrival();
      } catch {
        markArrivalRequestInFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    mode,
    driverUserId,
    rideDriver,
    rideRequestId,
    driverDot,
    pickup,
    remainingDistanceMeters,
    fetchRideSnapshot,
    exitDriverMapAfterArrival,
  ]);

  /** Follow driver; fallback to midpoint then pickup. */
  const cameraSettings = useMemo(() => {
    if (!pickup) return null;
    if (driverDot) {
      return {
        centerCoordinate: [driverDot.lon, driverDot.lat] as [number, number],
        zoomLevel: 15.1,
      };
    }
    return {
      centerCoordinate: [pickup.lon, pickup.lat] as [number, number],
      zoomLevel: 13.8,
    };
  }, [pickup, driverDot]);

  const cameraKey = useMemo(() => {
    if (!cameraSettings) return "c";
    const d = driverDot;
    return `c-${cameraSettings.centerCoordinate[0]}-${cameraSettings.centerCoordinate[1]}-${d?.lat ?? "x"}-${d?.lon ?? "x"}`;
  }, [cameraSettings, driverDot]);

  const title =
    mode === "driver" ? t("ride_tracking_map_title_driver") : t("ride_tracking_map_title_passenger");

  /** Live ETA line from route trim + OSRM duration (driver and passenger maps). */
  const liveEtaPrimaryLine = useMemo(() => {
    if (mode !== "passenger" && mode !== "driver") return null;
    if (atPickupArrival) {
      return t("ride_driver_eta_minutes_away", { minutes: 0 });
    }
    if (etaSecondsRemaining != null && Number.isFinite(etaSecondsRemaining)) {
      const sec = navEtaSecondsForDisplay(etaSecondsRemaining, pickupNavLockOpts);
      if (sec != null && sec < 90) {
        return t("ride_tracking_passenger_eta_seconds", { seconds: sec });
      }
      const min = navEtaMinutesFromSeconds(etaSecondsRemaining, pickupNavLockOpts);
      if (min != null && min <= 1) {
        return t("ride_driver_eta_arriving_now");
      }
      if (min != null) {
        return t("ride_driver_eta_minutes_away", { minutes: min });
      }
    }
    if (apiEtaMin != null) {
      if (apiEtaMin <= 1) {
        return t("ride_driver_eta_arriving_now");
      }
      return t("ride_driver_eta_minutes_away", { minutes: apiEtaMin });
    }
    return null;
  }, [mode, atPickupArrival, pickupNavLockOpts, etaSecondsRemaining, apiEtaMin, t]);

  const onDriverCancelRidePress = useCallback(() => {
    if (driverUserId == null || driverCancellingRide) return;
    appAlert(
      t("ride_driver_cancel_ride_confirm_title"),
      t("ride_driver_cancel_ride_confirm_message"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("ride_driver_cancel_ride_button"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDriverCancellingRide(true);
              try {
                await cancelRideRequest(rideRequestId, driverUserId);
                markDriverCancelledOwnRide();
                navigateDriverOutToRequests();
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                appAlert(t("error"), msg, [{ text: t("ok") }]);
              } finally {
                setDriverCancellingRide(false);
              }
            })();
          },
        },
      ]
    );
  }, [driverUserId, driverCancellingRide, rideRequestId, t, navigateDriverOutToRequests]);

  const distDisplayKm = useMemo(() => {
    const liveKm = navDistanceKmFromMeters(remainingDistanceMeters, pickupNavLockOpts);
    if (liveKm != null) return liveKm;
    return apiDistKm;
  }, [remainingDistanceMeters, atPickupArrival, apiDistKm]);

  const legProgress01 = useMemo(() => {
    if (atPickupArrival) return 1;
    if (osrmLegDistanceM == null || osrmLegDistanceM <= 0 || remainingDistanceMeters == null) {
      return 0;
    }
    return Math.max(0, Math.min(1, 1 - remainingDistanceMeters / osrmLegDistanceM));
  }, [atPickupArrival, osrmLegDistanceM, remainingDistanceMeters]);

  const arrivalClockLine = useMemo(() => {
    if (atPickupArrival) {
      const locale = i18n.language === "he" ? "he-IL" : "ar";
      return new Date().toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (etaSecondsRemaining != null && Number.isFinite(etaSecondsRemaining)) {
      const locale = i18n.language === "he" ? "he-IL" : "ar";
      return new Date(Date.now() + etaSecondsRemaining * 1000).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (apiEtaMin != null) {
      const locale = i18n.language === "he" ? "he-IL" : "ar";
      return new Date(Date.now() + apiEtaMin * 60_000).toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return null;
  }, [atPickupArrival, etaSecondsRemaining, apiEtaMin, i18n.language]);

  const trackingNavStats = useMemo((): [NavInfoStat, NavInfoStat, NavInfoStat] => {
    return [
      {
        label: t("ride_tracking_passenger_live_eta_label"),
        value: liveEtaPrimaryLine ?? t("ride_tracking_eta_pending"),
        icon: "time-outline",
        highlight: true,
        valueFlexible: true,
      },
      {
        label: t("distance"),
        value:
          distDisplayKm != null
            ? t("ride_distance_to_pickup_km", { km: distDisplayKm })
            : t("ride_tracking_distance_pending"),
        icon: "navigate-outline",
        valueFlexible: true,
      },
      {
        label: t("eta_arrival"),
        value: arrivalClockLine ?? "—",
        icon: "location-outline",
      },
    ];
  }, [t, liveEtaPrimaryLine, distDisplayKm, arrivalClockLine]);

  const activeRide =
    mode === "driver"
      ? rideDriver?.id === rideRequestId
      : ridePassenger?.id === rideRequestId;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={
            mode === "passenger"
              ? navigatePassengerOutOfMapToRideRequests
              : navigateDriverOutToRequests
          }
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={
            mode === "passenger" ? t("ride_tracking_passenger_back_to_requests_a11y") : undefined
          }
        >
          <Ionicons name="chevron-back" size={28} color={TEAL} />
          {mode === "passenger" ? (
            <Text style={styles.backBtnRequestsLabel} numberOfLines={1}>
              {t("ride_tracking_passenger_back_to_requests_short")}
            </Text>
          ) : null}
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : error === "session" ? (
        <Text style={styles.err}>{t("ride_session_invalid")}</Text>
      ) : error === "load" ? (
        <Text style={styles.err}>{t("ride_failed_load_requests")}</Text>
      ) : !activeRide || !pickup ? (
        <Text style={styles.err}>{t("ride_tracking_map_unavailable")}</Text>
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
                <ShapeSource id="rideRouteBackdrop" shape={routeBackdropFc}>
                  <LineLayer
                    id="rideRouteBackdropLayer"
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
                <ShapeSource id="rideRouteRemaining" shape={routeRemainingFc}>
                  <LineLayer
                    id="rideRouteRemainingLayer"
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
                  the trimmed remaining route — only shows when the driver is
                  visibly off the road geometry. */}
              {showOverlays ? (
                <OffRoutePathConnector
                  id="rideRouteConnector"
                  from={driverDot}
                  to={routeRemainingStart}
                  color={ROUTE_BLUE}
                  width={3}
                />
              ) : null}
              {showOverlays && routeRemainingStart ? (
                <PointAnnotation
                  id="rideRouteStart"
                  coordinate={routeRemainingStart}
                >
                  <RouteEndpointMarker variant="start" color={ROUTE_BLUE} />
                </PointAnnotation>
              ) : null}
              {showOverlays ? (
                <PointAnnotation
                  id="pickup_mark"
                  coordinate={[pickup.lon, pickup.lat]}
                >
                  <RouteEndpointMarker variant="end" iconName="navigate" />
                </PointAnnotation>
              ) : null}
              {showOverlays && driverDot ? (
                <PointAnnotation
                  id="driver_mark"
                  coordinate={[driverDot.lon, driverDot.lat]}
                >
                  <RideDriverMapMarker
                    size="expanded"
                    headingDeg={driverTrailHeadingDeg}
                    vehicleIcon="car"
                  />
                </PointAnnotation>
              ) : null}
            </FocusedMapView>
            {routeLoading ? (
              <View style={styles.routeLoading}>
                <ActivityIndicator color="#fff" />
                <Text style={[styles.routeLoadingText, styles.routeLoadingTextPad]}>
                  {t("ride_tracking_route_loading")}
                </Text>
              </View>
            ) : null}
          </View>

          {mode === "passenger" || mode === "driver" ? (
            <NavigationInfoPanel
              accentColor={TEAL}
              isLive
              showLiveDot
              liveLabel={t(`ride_status_${statusStr}`)}
              stats={trackingNavStats}
              footNote={
                mode === "passenger"
                  ? t("ride_tracking_passenger_live_eta_sub")
                  : t("ride_tracking_driver_live_eta_sub")
              }
              progress={legProgress01}
              showProgress={Boolean(
                osrmLegDistanceM != null && osrmLegDistanceM > 0 && remainingDistanceMeters != null
              )}
              startLabel={t("ride_trip_label_driver")}
              endLabel={t("ride_pickup")}
              contentPaddingBottom={mode === "passenger" ? Math.max(8, insets.bottom) : 8}
              style={styles.trackingNavPanel}
            >
              {mode === "driver" && rideDriver ? (
                <View style={styles.driverPassengerInfo}>
                  <Text style={styles.driverPassengerLine}>
                    {t("ride_driver_map_passenger_line", { username: rideDriver.regular_username })}
                  </Text>
                  {rideDriver.regular_phone ? (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(`tel:${rideDriver.regular_phone}`)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.driverPhoneLink}>
                        {t("ride_driver_map_phone_line", { phone: rideDriver.regular_phone })}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.trackingPanelMuted}>{t("ride_phone_visible_after_accept")}</Text>
                  )}
                </View>
              ) : null}
              {(() => {
                const remainM = navRemainingMeters(remainingDistanceMeters, pickupNavLockOpts);
                return remainM != null && remainM < 5000 ? (
                  <Text style={styles.trackingSubLine}>
                    {t("ride_tracking_remaining_meters", {
                      meters: Math.round(remainM),
                    })}
                  </Text>
                ) : null;
              })()}
              {mode === "passenger" && !driverDot ? (
                <Text style={styles.trackingPanelHint}>{t("ride_tracking_waiting_driver_location")}</Text>
              ) : null}
              {mode === "driver" && !myDriverGps ? (
                <Text style={styles.trackingPanelHint}>{t("ride_tracking_waiting_gps")}</Text>
              ) : null}
            </NavigationInfoPanel>
          ) : null}

          {mode === "driver" ? (
            <TouchableOpacity
              style={[
                styles.driverCancelRideBtn,
                { marginBottom: Math.max(12, insets.bottom) },
                driverCancellingRide && styles.driverCancelRideBtnDisabled,
              ]}
              onPress={onDriverCancelRidePress}
              disabled={driverCancellingRide}
              activeOpacity={0.85}
            >
              {driverCancellingRide ? (
                <ActivityIndicator color="#c62828" />
              ) : (
                <Text style={styles.driverCancelRideBtnText}>{t("ride_driver_cancel_ride_button")}</Text>
              )}
            </TouchableOpacity>
          ) : null}

          {mode === "passenger" ? (
            <TouchableOpacity
              style={[styles.passengerBackToRequestsBtn, { marginBottom: Math.max(10, insets.bottom) }]}
              onPress={navigatePassengerOutOfMapToRideRequests}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={18} color={TEAL} />
              <Text style={styles.passengerBackToRequestsBtnText}>
                {t("ride_tracking_passenger_back_to_requests_button")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
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
  backBtn: { flexDirection: "row", alignItems: "center", padding: 4, maxWidth: 140 },
  backBtnRequestsLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: TEAL,
    marginStart: 2,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: "#111", textAlign: "center" },
  headerSpacer: { width: 36 },
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
  routeLoadingText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  routeLoadingTextPad: { marginLeft: 10 },
  trackingNavPanel: { borderTopWidth: 0 },
  trackingSubLine: { fontSize: 13, color: "#444", marginTop: 6 },
  trackingPanelHint: { fontSize: 13, color: "#664d03", marginTop: 8, lineHeight: 18 },
  trackingPanelMuted: { fontSize: 13, color: "#777", marginTop: 4 },
  driverPassengerInfo: { marginTop: 0, marginBottom: 4 },
  driverPassengerLine: { fontSize: 15, fontWeight: "700", color: "#111", marginBottom: 6 },
  driverPhoneLink: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1565c0",
    textDecorationLine: "underline",
  },
  driverCancelRideBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#c62828",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  driverCancelRideBtnDisabled: { opacity: 0.55 },
  driverCancelRideBtnText: { color: "#c62828", fontWeight: "700", fontSize: 15 },
  passengerBackToRequestsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginHorizontal: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  passengerBackToRequestsBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: TEAL,
    marginStart: 8,
  },
  markerPickup: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  err: { textAlign: "center", color: "#842029", padding: 20 },
});
