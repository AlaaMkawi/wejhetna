import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MapView, Camera, PointAnnotation, ShapeSource, LineLayer } from "@maplibre/maplibre-react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { RootStackParamList } from "../../navigation/types";
import {
  getDriverRideRequests,
  getRegularLatestRideRequest,
  parseStoredUserId,
  RegularLatestRideRequest,
  DriverRideRequest,
  normalizeRideRequestStatus,
} from "../../api/rides";
import { RIDE_STATUS_POLL_INTERVAL_MS } from "../../../config";
import { fetchOsrmDrivingRoute } from "../../services/navigation/osrmRoute";
import { lineStringToFeatureCollection, type RouteCoordinatesFeatureCollection } from "../../types/navigation";
import type { RouteLineStringCoords } from "../../types/navigation";
import { haversineMeters } from "../../utils/routePolyline";
import { requestCurrentPositionWithRetry } from "../../utils/locationPermission";
import { RideDriverMapMarker } from "../../components/map/RideDriverMapMarker";
import { useDriverTrailHeading } from "../../components/map/useDriverTrailHeading";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";
const NEGEV_BOUNDS = {
  ne: [35.1, 31.42] as [number, number],
  sw: [34.72, 31.18] as [number, number],
};

const TEAL = "#0f5b63";
const ROUTE_BLUE = "#1565c0";

/** Min seconds between OSRM refetches when driver origin moves. */
const OSRM_MIN_INTERVAL_MS = 28_000;
/** Min meters driver must move before we refetch route (driver / passenger origin). */
const OSRM_MOVE_THRESHOLD_M = 220;

type Props = NativeStackScreenProps<RootStackParamList, "RideTrackingMap">;

export default function RideTrackingMapScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { mode, rideRequestId } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rideDriver, setRideDriver] = useState<DriverRideRequest | null>(null);
  const [ridePassenger, setRidePassenger] = useState<RegularLatestRideRequest | null>(null);
  const [myDriverGps, setMyDriverGps] = useState<{ lat: number; lon: number } | null>(null);

  const [routeFc, setRouteFc] = useState<RouteCoordinatesFeatureCollection | null>(null);
  const [osrmEtaSec, setOsrmEtaSec] = useState<number | null>(null);
  const [osrmDistM, setOsrmDistM] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const lastOsrmAtRef = useRef(0);
  const lastOsrmOriginRef = useRef<{ lat: number; lon: number } | null>(null);
  const hasRouteRef = useRef(false);

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

  const driverTrailHeadingDeg = useDriverTrailHeading(
    driverDot?.lat,
    driverDot?.lon,
    6
  );

  const statusStr = useMemo(() => {
    if (mode === "driver" && rideDriver) {
      return normalizeRideRequestStatus(rideDriver.status);
    }
    if (mode === "passenger" && ridePassenger) {
      return ridePassenger.status;
    }
    return "pending" as const;
  }, [mode, rideDriver, ridePassenger]);

  const apiEtaMin = mode === "passenger" ? ridePassenger?.eta_to_user ?? null : rideDriver?.eta_to_pickup_min ?? rideDriver?.eta_to_user ?? null;
  const apiDistKm = mode === "passenger" ? ridePassenger?.distance_to_pickup_km ?? null : rideDriver?.distance_to_pickup_km ?? null;

  const fetchRideSnapshot = useCallback(async () => {
    setError(null);
    try {
      if (mode === "driver") {
        const stored = await AsyncStorage.getItem("userId");
        const did = parseStoredUserId(stored);
        if (did == null) {
          setError("session");
          setRideDriver(null);
          return;
        }
        const list = await getDriverRideRequests(did);
        const row = list.find((x) => x.id === rideRequestId) ?? null;
        setRideDriver(row);
      } else {
        const stored = await AsyncStorage.getItem("userId");
        const uid = parseStoredUserId(stored);
        if (uid == null) {
          setError("session");
          setRidePassenger(null);
          return;
        }
        const row = await getRegularLatestRideRequest(uid);
        setRidePassenger(row);
      }
    } catch {
      setError("load");
    } finally {
      setLoading(false);
    }
  }, [mode, rideRequestId]);

  useEffect(() => {
    void fetchRideSnapshot();
    const id = setInterval(() => {
      void fetchRideSnapshot();
    }, RIDE_STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchRideSnapshot]);

  /** Driver: live GPS for “my” position on the map. */
  useEffect(() => {
    if (mode !== "driver") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const pos = await requestCurrentPositionWithRetry();
        if (!cancelled) {
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

  /** OSRM route driver → pickup when both ends known (throttled). */
  useEffect(() => {
    if (!pickup || !driverDot) {
      hasRouteRef.current = false;
      setRouteFc(null);
      setOsrmEtaSec(null);
      setOsrmDistM(null);
      return;
    }

    const from = driverDot;
    const to = pickup;
    if (haversineMeters(from.lat, from.lon, to.lat, to.lon) < 18) {
      hasRouteRef.current = true;
      setRouteFc(
        lineStringToFeatureCollection([
          [from.lon, from.lat],
          [to.lon, to.lat],
        ])
      );
      setOsrmEtaSec(0);
      setOsrmDistM(0);
      return;
    }

    const now = Date.now();
    const last = lastOsrmOriginRef.current;
    const moved =
      !last || haversineMeters(last.lat, last.lon, from.lat, from.lon) >= OSRM_MOVE_THRESHOLD_M;
    const cooled = now - lastOsrmAtRef.current >= OSRM_MIN_INTERVAL_MS;
    if (!moved && !cooled && hasRouteRef.current) {
      return;
    }

    let cancelled = false;
    setRouteLoading(true);
    (async () => {
      try {
        const osrm = await fetchOsrmDrivingRoute(from, to);
        if (cancelled) return;
        lastOsrmAtRef.current = Date.now();
        lastOsrmOriginRef.current = { lat: from.lat, lon: from.lon };
        hasRouteRef.current = true;
        setOsrmEtaSec(osrm.durationSeconds);
        setOsrmDistM(osrm.distanceMeters);
        setRouteFc(lineStringToFeatureCollection(osrm.coordinates));
      } catch {
        if (cancelled) return;
        hasRouteRef.current = true;
        const fallback: RouteLineStringCoords = [
          [from.lon, from.lat],
          [to.lon, to.lat],
        ];
        setRouteFc(lineStringToFeatureCollection(fallback));
        setOsrmEtaSec(null);
        setOsrmDistM(haversineMeters(from.lat, from.lon, to.lat, to.lon));
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickup?.lat, pickup?.lon, driverDot?.lat, driverDot?.lon]);

  const cameraSettings = useMemo(() => {
    if (!pickup) return null;
    if (driverDot) {
      return {
        centerCoordinate: [(pickup.lon + driverDot.lon) / 2, (pickup.lat + driverDot.lat) / 2] as [
          number,
          number,
        ],
        zoomLevel: 12.6,
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

  const etaDisplayMin = osrmEtaSec != null ? Math.max(1, Math.round(osrmEtaSec / 60)) : apiEtaMin;
  const distDisplayKm =
    osrmDistM != null ? Math.round((osrmDistM / 1000) * 10) / 10 : apiDistKm;

  const activeRide =
    mode === "driver"
      ? rideDriver?.id === rideRequestId
      : ridePassenger?.id === rideRequestId;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={28} color={TEAL} />
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
            <MapView
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
              {routeFc ? (
                <ShapeSource id="rideRouteLine" shape={routeFc}>
                  <LineLayer
                    id="rideRouteLayer"
                    style={{
                      lineColor: ROUTE_BLUE,
                      lineWidth: 5,
                      lineOpacity: 0.88,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </ShapeSource>
              ) : null}
              <PointAnnotation id="pickup_mark" coordinate={[pickup.lon, pickup.lat]}>
                <View style={styles.markerPickup}>
                  <Ionicons name="navigate" size={20} color="#fff" />
                </View>
              </PointAnnotation>
              {driverDot ? (
                <PointAnnotation
                  id="driver_mark"
                  coordinate={[driverDot.lon, driverDot.lat]}
                >
                  <RideDriverMapMarker
                    size="expanded"
                    headingDeg={driverTrailHeadingDeg}
                  />
                </PointAnnotation>
              ) : null}
            </MapView>
            {routeLoading ? (
              <View style={styles.routeLoading}>
                <ActivityIndicator color="#fff" />
                <Text style={[styles.routeLoadingText, styles.routeLoadingTextPad]}>
                  {t("ride_tracking_route_loading")}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelStatus}>{t(`ride_status_${statusStr}`)}</Text>
            {etaDisplayMin != null ? (
              <Text style={styles.panelLine}>
                {etaDisplayMin <= 1
                  ? t("ride_driver_eta_arriving_now")
                  : t("ride_driver_eta_minutes_away", { minutes: etaDisplayMin })}
              </Text>
            ) : (
              <Text style={styles.panelMuted}>{t("ride_tracking_eta_pending")}</Text>
            )}
            {distDisplayKm != null ? (
              <Text style={styles.panelLine}>
                {t("ride_distance_to_pickup_km", { km: distDisplayKm })}
              </Text>
            ) : (
              <Text style={styles.panelMuted}>{t("ride_tracking_distance_pending")}</Text>
            )}
            {mode === "passenger" && !driverDot ? (
              <Text style={styles.panelHint}>{t("ride_tracking_waiting_driver_location")}</Text>
            ) : null}
            {mode === "driver" && !myDriverGps ? (
              <Text style={styles.panelHint}>{t("ride_tracking_waiting_gps")}</Text>
            ) : null}
          </View>
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
  backBtn: { padding: 4 },
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
  panel: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
  },
  panelStatus: { fontSize: 16, fontWeight: "700", color: TEAL, marginBottom: 6 },
  panelLine: { fontSize: 15, color: "#222", marginTop: 4 },
  panelMuted: { fontSize: 13, color: "#777", marginTop: 4 },
  panelHint: { fontSize: 13, color: "#664d03", marginTop: 8, lineHeight: 18 },
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
