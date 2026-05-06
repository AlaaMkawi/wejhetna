import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps, NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import { openDrivingRoutePreview } from "../../navigation/openDrivingRoutePreview";
import {
  DriverRideRequest,
  RegularLatestRideRequest,
  getDriverRideRequests,
  getRegularLatestRideRequest,
  normalizeRideRequestStatus,
  parseStoredUserId,
  updateDriverLocation,
} from "../../api/rides";
import { requestCurrentPositionWithRetry } from "../../utils/locationPermission";
import {
  isDriverRideStatusEligibleForPickupNav,
  isPassengerRideStatusEligibleForPickupNav,
} from "../../utils/ridePickupNavigationGuards";
import { navigateToUserRideRequestsTab } from "../../utils/rideNavigateToTripScreen";

const TEAL = "#0f5b63";

type Props = NativeStackScreenProps<RootStackParamList, "RidePickupNavigation">;

/**
 * Unified pickup-route entrypoint — **same screen & same engine for both roles**.
 *
 * - DRIVER: loads fresh ride snapshot + current GPS, then calls openDrivingRoutePreview
 *   with origin=driverGPS and destination=pickup point. The transient screen is replaced
 *   by RouteDetails in live-navigation mode with `rideContext.mode="pickup"` and
 *   `role="DRIVER"` — full GPS-driven nav (ETA, polyline trim, reroute, arrival detection).
 * - PASSENGER: loads fresh ride snapshot to read the driver's last known live location, then
 *   calls the **same** openDrivingRoutePreview with origin=driver_live and destination=pickup.
 *   The transient screen is replaced by RouteDetails in "passenger-pickup viewer" mode
 *   (`rideContext.mode="pickup"` + `role="REGULAR"`). RouteDetails skips the passenger's own
 *   GPS watcher (irrelevant + would false-trigger arrival) and instead polls the driver's
 *   live location, feeding it into the existing pipeline: setUserLocation → polyline trim →
 *   ETA recompute → camera follow → reroute on drift.
 *
 * No navigation/route logic is duplicated — both roles share `openDrivingRoutePreview` +
 * `RouteDetails`. Each entry creates a fresh mount so ETA/polyline/driver marker are always
 * up-to-date.
 */
export default function RidePickupNavigationScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { rideRequestId } = route.params;

  const [role, setRole] = useState<"DRIVER" | "REGULAR" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rideDriver, setRideDriver] = useState<DriverRideRequest | null>(null);
  const [ridePassenger, setRidePassenger] = useState<RegularLatestRideRequest | null>(null);
  const [myDriverGps, setMyDriverGps] = useState<{ lat: number; lon: number } | null>(null);
  const [driverUserId, setDriverUserId] = useState<number | null>(null);
  const launchedRef = useRef(false);
  /** Passenger: driver already at pickup while this shell is still waiting to launch nav. */
  const passengerArrivedRedirectDoneRef = useRef(false);

  const resolveRole = useCallback(async () => {
    try {
      const r = await AsyncStorage.getItem("userRole");
      const kind: "DRIVER" | "REGULAR" = r === "DRIVER" ? "DRIVER" : "REGULAR";
      setRole(kind);
      const stored = await AsyncStorage.getItem("userId");
      const uid = parseStoredUserId(stored);
      if (uid == null) {
        setError("session");
        return;
      }

      if (kind === "DRIVER") {
        setDriverUserId(uid);
        const list = await getDriverRideRequests(uid);
        setRideDriver(list.find((x) => x.id === rideRequestId) ?? null);
      } else {
        const latest = await getRegularLatestRideRequest(uid);
        setRidePassenger(latest?.id === rideRequestId ? latest : null);
      }
    } catch {
      setError("load");
    }
  }, [rideRequestId]);

  useEffect(() => {
    void resolveRole();
  }, [resolveRole]);

  useEffect(() => {
    if (role !== "REGULAR") return;
    if (passengerArrivedRedirectDoneRef.current) return;
    const ride = ridePassenger;
    if (!ride || ride.id !== rideRequestId) return;
    if (normalizeRideRequestStatus(ride.status) !== "arrived") return;
    passengerArrivedRedirectDoneRef.current = true;
    const parent = navigation.getParent() as NativeStackNavigationProp<RootStackParamList> | undefined;
    if (parent) {
      navigateToUserRideRequestsTab(parent, "REGULAR");
    }
  }, [role, ridePassenger, rideRequestId, navigation]);

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
    return () => {
      cancelled = true;
    };
  }, [role]);

  // Driver side: keep backend live location fresh so the passenger's viewer sees the latest GPS.
  useEffect(() => {
    if (driverUserId == null || !myDriverGps) return;
    void updateDriverLocation({
      driver_user_id: driverUserId,
      lat: myDriverGps.lat,
      lon: myDriverGps.lon,
    });
  }, [driverUserId, myDriverGps]);

  // Driver: launch unified nav once snapshot + GPS are ready.
  useEffect(() => {
    if (launchedRef.current) return;
    if (role !== "DRIVER") return;
    const ride = rideDriver;
    if (!ride) return;
    if (!isDriverRideStatusEligibleForPickupNav(ride.status)) {
      setError("state");
      return;
    }
    const pickupValid =
      ride.pickup_lat != null &&
      ride.pickup_lon != null &&
      Number.isFinite(ride.pickup_lat) &&
      Number.isFinite(ride.pickup_lon);
    if (!pickupValid) {
      setError("pickup");
      return;
    }
    if (!myDriverGps) return;

    launchedRef.current = true;

    const pickup = { lat: ride.pickup_lat as number, lon: ride.pickup_lon as number };

    void openDrivingRoutePreview({
      navigation: {
        navigate: (_name, params) => navigation.replace("RouteDetails", params),
      },
      destination: { ...pickup, name: t("ride_pickup") || "Pickup" },
      t,
      setRouteLoading: () => {
        /* transient screen; loader handled inline */
      },
      originOverride: myDriverGps,
      navigationPhase: "active",
      // Pickup point can be anywhere — 3-city rule applies only to the
      // final ride destination, never to where the driver is picking up.
      skipDestinationBoundaryCheck: true,
      routeDetailsExtras: {
        rideContext: {
          rideRequestId,
          destinationText: t("ride_pickup") || "Pickup",
          destinationLat: pickup.lat,
          destinationLon: pickup.lon,
          driverName: t("ride_trip_you_marker") || "You",
          driverPhone: null,
          passengerName: ride.regular_full_name?.trim()
            ? `${ride.regular_full_name.trim()} (@${ride.regular_username})`
            : `@${ride.regular_username ?? ""}`,
          passengerPhone: ride.regular_phone ?? null,
          role: "DRIVER",
          mode: "pickup",
        },
      },
    }).catch(() => {
      launchedRef.current = false;
    });
  }, [role, rideDriver, myDriverGps, navigation, rideRequestId, t]);

  // Passenger: launch unified nav using driver's last known live location as origin.
  useEffect(() => {
    if (launchedRef.current) return;
    if (role !== "REGULAR") return;
    const ride = ridePassenger;
    if (!ride) return;
    if (!isPassengerRideStatusEligibleForPickupNav(ride.status)) {
      setError("state");
      return;
    }
    const pickupValid =
      ride.pickup_lat != null &&
      ride.pickup_lon != null &&
      Number.isFinite(ride.pickup_lat) &&
      Number.isFinite(ride.pickup_lon);
    if (!pickupValid) {
      setError("pickup");
      return;
    }
    const driverLiveValid =
      ride.driver_live_lat != null &&
      ride.driver_live_lon != null &&
      Number.isFinite(ride.driver_live_lat) &&
      Number.isFinite(ride.driver_live_lon);
    if (!driverLiveValid) {
      // Driver has not pushed a GPS update yet – wait for next poll cycle.
      return;
    }

    launchedRef.current = true;

    const pickup = { lat: ride.pickup_lat as number, lon: ride.pickup_lon as number };
    const driverLive = {
      lat: ride.driver_live_lat as number,
      lon: ride.driver_live_lon as number,
    };

    void openDrivingRoutePreview({
      navigation: {
        navigate: (_name, params) => navigation.replace("RouteDetails", params),
      },
      destination: { ...pickup, name: t("ride_pickup") || "Pickup" },
      t,
      setRouteLoading: () => {
        /* transient screen; loader handled inline */
      },
      // Origin = driver's live location so the polyline starts where the driver currently is.
      // Fresh OSRM fetch on every entry keeps the polyline up-to-date.
      originOverride: driverLive,
      navigationPhase: "active",
      // Passenger-side viewer of the driver's approach: same pickup point
      // semantics, so the 3-city destination rule must not apply here.
      skipDestinationBoundaryCheck: true,
      routeDetailsExtras: {
        rideContext: {
          rideRequestId,
          destinationText: t("ride_pickup") || "Pickup",
          destinationLat: pickup.lat,
          destinationLon: pickup.lon,
          driverName: ride.driver_full_name?.trim()
            ? ride.driver_full_name.trim()
            : ride.driver_username ?? "",
          driverPhone: ride.driver_phone ?? null,
          passengerName: t("ride_trip_you_marker") || "You",
          passengerPhone: null,
          role: "REGULAR",
          mode: "pickup",
        },
      },
    }).catch(() => {
      launchedRef.current = false;
    });
  }, [role, ridePassenger, navigation, rideRequestId, t]);

  // Passenger: keep ride snapshot fresh until nav handoff (no live GPS yet, or rare status-only updates).
  useEffect(() => {
    if (role !== "REGULAR") return;
    if (launchedRef.current) return;
    const ride = ridePassenger;
    if (!ride || ride.id !== rideRequestId) return;
    const id = setInterval(() => {
      void resolveRole();
    }, 2500);
    return () => clearInterval(id);
  }, [role, ridePassenger, rideRequestId, resolveRole]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      {error === "session" ? (
        <Text style={styles.err}>{t("ride_session_invalid")}</Text>
      ) : error === "pickup" ? (
        <Text style={styles.err}>{t("ride_trip_no_destination_coords")}</Text>
      ) : error === "state" ? (
        <Text style={styles.err}>{t("ride_trip_invalid_state")}</Text>
      ) : (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  err: { padding: 24, textAlign: "center", color: "#b00020", fontSize: 16 },
});
