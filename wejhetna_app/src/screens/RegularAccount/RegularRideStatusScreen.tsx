import React, { Fragment, useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { useTranslation } from "react-i18next";
import { MapView, Camera, PointAnnotation } from "@maplibre/maplibre-react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import {
  getRegularLatestRideRequest,
  parseStoredUserId,
  RegularLatestRideRequest,
  RideRequestStatus,
} from "../../api/rides";
import { RIDE_STATUS_POLL_INTERVAL_MS, RIDE_UI_BUILD } from "../../../config";
import { RideDriverMapMarker } from "../../components/map/RideDriverMapMarker";
import { useDriverTrailHeading } from "../../components/map/useDriverTrailHeading";

const TRACKING_MAP_STYLE =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";
const NEGEV_BOUNDS = {
  ne: [35.1, 31.42] as [number, number],
  sw: [34.72, 31.18] as [number, number],
};

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

export default function RegularRideStatusScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [userId, setUserId] = useState<number | null>(null);
  const [latest, setLatest] = useState<RegularLatestRideRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const driverTrailHeadingDeg = useDriverTrailHeading(
    latest?.driver_live_lat,
    latest?.driver_live_lon,
    6
  );

  const refresh = useCallback(async () => {
    const stored = await AsyncStorage.getItem("userId");
    const id = parseStoredUserId(stored);
    setUserId(id);
    if (id == null) {
      setLatest(null);
      setLoading(false);
      setLoadError(false);
      return;
    }
    try {
      const row = await getRegularLatestRideRequest(id);
      setLatest(row);
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

  const mapCamera = useMemo(() => {
    if (!latest || !hasValidPickup(latest)) {
      return null;
    }
    const plon = latest.pickup_lon;
    const plat = latest.pickup_lat;
    const dlon = latest.driver_live_lon;
    const dlat = latest.driver_live_lat;
    if (
      dlon != null &&
      dlat != null &&
      Number.isFinite(dlon) &&
      Number.isFinite(dlat)
    ) {
      return {
        centerCoordinate: [(plon + dlon) / 2, (plat + dlat) / 2] as [number, number],
        zoomLevel: 12.9,
      };
    }
    return {
      centerCoordinate: [plon, plat] as [number, number],
      zoomLevel: 14,
    };
  }, [
    latest?.pickup_lat,
    latest?.pickup_lon,
    latest?.driver_live_lat,
    latest?.driver_live_lon,
  ]);

  const cameraKey = useMemo(() => {
    if (!latest || !hasValidPickup(latest)) return "cam";
    const dlat = latest.driver_live_lat ?? "x";
    const dlon = latest.driver_live_lon ?? "x";
    return `cam-${latest.id}-${dlat}-${dlon}-${latest.pickup_lat}-${latest.pickup_lon}`;
  }, [
    latest?.id,
    latest?.driver_live_lat,
    latest?.driver_live_lon,
    latest?.pickup_lat,
    latest?.pickup_lon,
  ]);

  const renderBody = () => {
    if (userId == null) {
      return <Text style={styles.muted}>{t("ride_session_invalid")}</Text>;
    }
    if (loadError) {
      return <Text style={styles.errorText}>{t("ride_failed_load_requests")}</Text>;
    }
    if (latest == null) {
      return <Text style={styles.empty}>{t("ride_tracking_empty")}</Text>;
    }

    const st = latest.status;
    const eta = latest.eta_to_user;
    const phaseKey = passengerPhaseKey(st, eta);
    const phaseLine = phaseKey ? t(phaseKey) : null;

    const etaLine =
      (st === "on_the_way" || st === "driving_to_customer") && eta != null && eta <= 1
        ? t("ride_driver_eta_arriving_now")
        : (st === "on_the_way" || st === "driving_to_customer") && eta != null
          ? t("ride_driver_eta_minutes_away", { minutes: eta })
          : st === "accepted" && eta != null
            ? `${t("ride_eta_pickup_estimate")}: ${eta} ${t("ride_min")}`
            : null;

    const distLine =
      latest.distance_to_pickup_km != null &&
      (st === "accepted" ||
        st === "on_the_way" ||
        st === "driving_to_customer" ||
        st === "arrived")
        ? t("ride_distance_to_pickup_km", { km: latest.distance_to_pickup_km })
        : null;

    const showTrackingMap =
      hasValidPickup(latest) &&
      (st === "accepted" ||
        st === "on_the_way" ||
        st === "driving_to_customer" ||
        st === "arrived");

    return (
      <View style={styles.card}>
        <Text style={styles.statusLine}>{t(`ride_status_${st}`)}</Text>
        {phaseLine ? <Text style={styles.phaseLine}>{phaseLine}</Text> : null}
        <Text style={styles.driverLine}>
          {latest.driver_full_name} · @{latest.driver_username}
        </Text>
        <Text style={styles.destLine}>{latest.destination_text}</Text>
        {latest.estimated_trip_time != null ? (
          <Text style={styles.meta}>
            {t("ride_estimated_trip_time")}: {latest.estimated_trip_time} {t("ride_min")}
          </Text>
        ) : null}
        {distLine ? <Text style={styles.dist}>{distLine}</Text> : null}
        {etaLine ? <Text style={styles.eta}>{etaLine}</Text> : null}

        {showTrackingMap && mapCamera ? (
          <Fragment>
          <View style={styles.mapWrap}>
            <MapView
              style={styles.map}
              mapStyle={TRACKING_MAP_STYLE}
              scrollEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              logoEnabled={false}
              attributionEnabled={false}
            >
              <Camera
                key={cameraKey}
                defaultSettings={{
                  centerCoordinate: mapCamera.centerCoordinate,
                  zoomLevel: mapCamera.zoomLevel,
                }}
                maxBounds={NEGEV_BOUNDS}
                minZoomLevel={10}
                maxZoomLevel={18}
                animationMode="flyTo"
              />
              <PointAnnotation
                id={`pickup_${latest.id}`}
                coordinate={[latest.pickup_lon, latest.pickup_lat]}
              >
                <View style={styles.markerPickup}>
                  <Ionicons name="navigate" size={18} color="#fff" />
                </View>
              </PointAnnotation>
              {latest.driver_live_lon != null &&
              latest.driver_live_lat != null &&
              Number.isFinite(latest.driver_live_lon) &&
              Number.isFinite(latest.driver_live_lat) ? (
                <PointAnnotation
                  id={`driver_${latest.id}`}
                  coordinate={[latest.driver_live_lon, latest.driver_live_lat]}
                >
                  <RideDriverMapMarker
                    size="default"
                    headingDeg={driverTrailHeadingDeg}
                  />
                </PointAnnotation>
              ) : null}
            </MapView>
            <Text style={styles.mapLegend}>{t("ride_tracking_map_legend")}</Text>
          </View>
            <TouchableOpacity
              style={styles.openMapButton}
              onPress={() =>
                navigation.navigate("RideTrackingMap", {
                  mode: "passenger",
                  rideRequestId: latest.id,
                })
              }
              activeOpacity={0.85}
            >
              <Ionicons name="map-outline" size={22} color="#fff" />
              <Text style={styles.openMapButtonText}>{t("ride_tracking_open_map_passenger")}</Text>
            </TouchableOpacity>
          </Fragment>
        ) : null}

        {st === "arrived" && latest.verification_code ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeHint}>{t("ride_tracking_share_code_hint")}</Text>
            <Text style={styles.codeDigits}>{latest.verification_code}</Text>
          </View>
        ) : null}
      </View>
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
  statusLine: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0f5b63",
    marginBottom: 6,
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
  mapWrap: {
    marginTop: 14,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15,91,99,0.2)",
  },
  map: { width: "100%", height: 220 },
  mapLegend: { fontSize: 11, color: "#555", paddingVertical: 8, textAlign: "center" },
  openMapButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f5b63",
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  openMapButtonText: { color: "#fff", fontSize: 15, fontWeight: "700", marginLeft: 10 },
  markerPickup: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0f5b63",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
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
  build: { fontSize: 11, color: "#999", textAlign: "center", marginTop: 28 },
});
