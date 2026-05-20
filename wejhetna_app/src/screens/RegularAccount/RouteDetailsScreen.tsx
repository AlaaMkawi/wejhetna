// src/screens/RegularAccount/RouteDetailsScreen.tsx

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { appAlert } from "../../utils/appAlert";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  Modal,
  Linking,
  InteractionManager,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { emitLiveNavigationExit } from "../../navigation/navigationEvents";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import {
  Camera,
  PointAnnotation,
  ShapeSource,
  LineLayer,
} from "@maplibre/maplibre-react-native";
import { FocusedMapView } from "../../components/map/FocusedMapView";
import { useMapScreenLifecycle } from "../../components/map/useMapScreenLifecycle";
import { useFocusEffect } from "@react-navigation/native";
import { suppressMapOverlays } from "../../components/map/mapOverlayStore";
import { resetMapAnnotationsReadyForPlatform } from "../../components/map/mapReadyStore";
import {
  logRouteDetailsMapExit,
  runIosRouteDetailsResetExit,
} from "../../utils/routeDetailsMapExit";
import {
  dispatchIosResetToHomeMap,
  resolveHomeRootRoute,
} from "../../utils/iosResetToHomeMap";
import { NativeGeolocation } from "../../utils/nativeGeolocation";
import Ionicons from "react-native-vector-icons/Ionicons";
import i18n from "../../i18n";
import { fetchOsrmDrivingRoute } from "../../services/navigation/osrmRoute";
import {
  lineStringToFeatureCollection,
  type RouteCoordinatesFeatureCollection,
} from "../../types/navigation";
import type { RouteLineStringCoords } from "../../types/navigation";
import {
  haversineMeters,
  minDistanceToPolylineMeters,
  snapToPolylinePoint,
  trimPolylineAheadOfUser,
  bearingDegrees,
  pointAtFractionAlongPolyline,
} from "../../utils/routePolyline";
import {
  getFreshPositionForNavigationStart,
  getNavigationRouteOrigin,
} from "../../utils/locationPermission";
import { smoothHeadingStep } from "../../utils/smoothGeoAnimation";
import {
  createKalmanLatLonSmoother,
  createWeightedEmaSmoother,
  type SmoothedPoint,
} from "../../utils/gpsSmoothing";
import { NavigationMarker } from "../../components/map/NavigationMarker";
import { RouteEtaOnMapLabel } from "../../components/map/RouteEtaOnMapLabel";
import { RouteEndpointMarker } from "../../components/map/RouteEndpointMarker";
import { OffRoutePathConnector } from "../../components/map/OffRoutePathConnector";
import {
  NavigationInfoPanel,
  type NavInfoStat,
} from "../../components/navigation/NavigationInfoPanel";
import { RideDestinationDetailsModal } from "../../components/ride/RideDestinationDetailsModal";
import { navigateToUserRideRequestsTab } from "../../utils/rideNavigateToTripScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  completeRideTrip,
  getDriverRideRequests,
  getRegularLatestRideRequest,
  markRideArrived,
  normalizeRideRequestStatus,
  parseStoredUserId,
  updateDriverLocation,
} from "../../api/rides";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import {
  clearNavigationRouteSnapshot,
  saveNavigationRouteSnapshot,
} from "../../db/offlineNavigationRoute";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

const DARK_TEAL = "#0f5b63";
const NAV_BLUE = "#4285F4";

const OFF_ROUTE_THRESHOLD_M = 50;
const ON_ROUTE_THRESHOLD_M = 28;
const REROUTE_MIN_INTERVAL_MS = 4500;
/** Re-fetch OSRM from current position to refresh duration/distance (no live traffic; static road model). */
const PROACTIVE_ROUTE_REFRESH_MS = 90_000;
/**
 * Hz at which we ask the FusedLocation provider to deliver fixes during live nav. Combined with
 * `distanceFilter: 0` (below) this guarantees a callback every second even when the vehicle is
 * stationary (e.g. waiting at a traffic light) — Google Maps-style "always alive" tracking.
 */
const LIVE_NAV_GPS_INTERVAL_MS = 1000;
/**
 * If the GPS callback hasn't fired for this long during active nav we log a watchdog warning. With
 * `distanceFilter: 0` + 1 Hz interval we expect a fix at least every ~2 s; anything longer means
 * the OS / provider is starving us and the user would perceive a "frozen" route.
 */
const GPS_STALL_WARNING_MS = 5000;
/**
 * Heartbeat period used during active nav to recompute ETA / remaining distance / route trimming
 * from the *last good fix* even when no new GPS sample arrived. Keeps the UI alive at traffic
 * lights without depending on movement.
 */
const NAV_HEARTBEAT_MS = 1500;
/** If the vehicle moves less than this from the stagnation anchor, we treat time as "blocked" (traffic, waiting). */
const STAGNATION_MOVE_THRESHOLD_M = 2.8;
/** If the vehicle has moved this far, clear stagnation (actually advancing). */
const STAGNATION_CLEAR_MOVE_M = 7;
const STAGNATION_MAX_SPEED_MPS = 1.1;
const STAGNATION_MAX_DELAY_SEC = 7200;
const ETA_CLOCK_TICK_MS = 4000;
const ARRIVAL_RADIUS_M = 55;
const SNAP_TRIM_M = 22;
/** If live start position is this far from the preview-route origin, refetch OSRM from the fresh point. */
const ROUTE_ORIGIN_DRIFT_REFETCH_M = 45;
/**
 * Stationary GPS fixes (especially on Android Fused) routinely report accuracy in the 30–60 m
 * range while the radio settles. Hard-rejecting at 30 m made the UI freeze at traffic lights;
 * 60 m matches what Google Maps tolerates and lets the smoother absorb the noise.
 */
const MAX_ACCEPTABLE_ACCURACY_M = 60;
const MAX_IMPLIED_SPEED_MPS = 55; // ~198 km/h (reject obvious teleports)
const MAX_JUMP_METERS = 80;
const MAX_JUMP_WINDOW_S = 2.0;
const SNAP_TO_ROUTE_THRESHOLD_M = 15;
const USE_KALMAN_SMOOTHER = true;
const GPS_DEBUG = true;

type RouteDetailsRoute = NativeStackScreenProps<RootStackParamList, "RouteDetails">;

export default function RouteDetailsScreen({ route, navigation }: RouteDetailsRoute) {
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();
  const isOnlineRef = useRef(true);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);
  const {
    routeInfo: initialRouteInfo,
    destination,
    userLocation: initialUserLocation,
    routeCoordinates: initialRouteCoordinates,
    navigationPhase: navigationPhaseParam,
    rideContext,
  } = route.params;

  const mapRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const {
    showOverlays,
    hideOverlays,
    withOverlayPause,
    screenActiveRef,
  } = useMapScreenLifecycle();
  /** When false, RouteDetails renders a plain View (no MLRNMapView) during iOS exit. */
  const [screenMapActive, setScreenMapActive] = useState(true);
  /** Gates Camera + MapLibre layers inside the MapView. */
  const [mapLayersMounted, setMapLayersMounted] = useState(true);
  const mapLayersMountedRef = useRef(true);
  mapLayersMountedRef.current = mapLayersMounted;
  const routeExitInProgressRef = useRef(false);
  const mapCallbacksAllowed = useCallback(
    () => !routeExitInProgressRef.current && screenActiveRef.current,
    [screenActiveRef]
  );
  const [routeExitLocked, setRouteExitLocked] = useState(false);

  const clearLocationWatch = useCallback(() => {
    const w = watchIdRef.current;
    if (w != null) {
      NativeGeolocation.clearWatch(w);
    }
    watchIdRef.current = null;
  }, []);

  const stopNavigationRefs = useCallback(() => {
    isNavigatingRef.current = false;
    isFollowingRef.current = false;
    offRouteSinceRef.current = null;
    headingForSmoothRef.current = null;
  }, []);

  const initialCoords: RouteLineStringCoords = useMemo(() => {
    const c = initialRouteCoordinates?.features?.[0]?.geometry?.coordinates;
    return Array.isArray(c) && c.length >= 2 ? c : [];
  }, [initialRouteCoordinates]);

  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(
    initialUserLocation
  );
  /** Smoothed position for marker + camera during live navigation (reduces jumps). */
  const [smoothedUserLocation, setSmoothedUserLocation] = useState<{
    lat: number;
    lon: number;
  }>(initialUserLocation);
  const [displayHeading, setDisplayHeading] = useState<number | null>(null);
  const [sessionPhase, setSessionPhase] = useState<"preview" | "active">(
    navigationPhaseParam === "active" ? "active" : "preview"
  );
  const [displayRouteFC, setDisplayRouteFC] = useState<RouteCoordinatesFeatureCollection>(() =>
    lineStringToFeatureCollection(
      initialCoords.length >= 2
        ? initialCoords
        : [
            [initialUserLocation.lon, initialUserLocation.lat],
            [destination.lon, destination.lat],
          ]
    )
  );

  const [routeInfo, setRouteInfo] = useState(initialRouteInfo);
  const [remainingSeconds, setRemainingSeconds] = useState(Math.max(0, initialRouteInfo.duration));
  /** Remaining distance along the current leg (geometry); updated as the polyline is trimmed. */
  const [remainingRouteMeters, setRemainingRouteMeters] = useState(initialRouteInfo.distance);
  /**
   * Extra seconds when GPS shows almost no progress (queues / traffic). Added to `remainingSeconds`
   * for ETA and labels so wall-clock arrival moves later; cleared when moving on the road or along the route.
   */
  const [stagnationDelaySec, setStagnationDelaySec] = useState(0);
  const stagnationAccRef = useRef(0);
  const stagnationAnchorRef = useRef<{ lat: number; lon: number } | null>(null);
  const stagnationLastGpsTsRef = useRef(0);
  const lastStagnationUiAtRef = useRef(0);
  /** Mirrors last value passed to `setStagnationDelaySec` to avoid duplicate updates. */
  const publishedStagnationRef = useRef(0);
  const prevRemainingLengthMetersRef = useRef<number | null>(null);
  /** Passenger follow: wall-clock for stagnation `dt` between driver_live polls. */
  const passengerStagnationWallTsRef = useRef(0);
  /**
   * Bumps periodically during active nav so `Date.now() + effectiveRemaining` re-renders when geometry is flat (idle).
   */
  const [etaTick, setEtaTick] = useState(0);
  const watchIdRef = useRef<number | null>(null);
  const hasArrivedRef = useRef(false);
  const autoStartedLiveNavRef = useRef(false);
  const [showFullRoute, setShowFullRoute] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [currentHeading, setCurrentHeading] = useState<number | null>(null);
  const [mapBearing, setMapBearing] = useState<number>(0);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [rideDestModalOpen, setRideDestModalOpen] = useState(false);
  // Ride-only arrival modal: replaces the generic "You arrived" popup while a ride is active.
  const [rideTripArrivedModal, setRideTripArrivedModal] = useState(false);
  /** `driver` = waiting for passenger to end trip; `passenger` = must tap to call `complete`. */
  const [tripArrivalKind, setTripArrivalKind] = useState<null | "driver" | "passenger">(null);
  const [completingRideTrip, setCompletingRideTrip] = useState(false);
  /** Trip leg: passenger follows driver GPS — fire destination arrival once from driver position. */
  const tripDestArrivalPromptedRef = useRef(false);
  // Pickup-mode arrival: driver reached passenger's pickup — 5 sec auto-dismiss popup + server notify.
  const [ridePickupArrivedModal, setRidePickupArrivedModal] = useState(false);
  /** Passenger pickup viewer: detect `arrived` from API even when driver_live stops updating. */
  const passengerPickupArrivedFromServerRef = useRef(false);

  const activeRouteCoordsRef = useRef<RouteLineStringCoords>(
    initialCoords.length >= 2 ? [...initialCoords] : [...initialCoords]
  );
  const legDistanceRef = useRef(initialRouteInfo.distance);
  const legDurationRef = useRef(initialRouteInfo.duration);
  const lastRerouteAtRef = useRef(0);
  const lastProactiveRouteAtRef = useRef(0);
  const offRouteSinceRef = useRef<number | null>(null);
  const isNavigatingRef = useRef(false);
  const isFollowingRef = useRef(false);
  const userLocationRef = useRef<{ lat: number; lon: number } | null>(initialUserLocation);
  const destinationRef = useRef(destination);
  const rideContextRef = useRef(rideContext ?? null);
  useEffect(() => {
    rideContextRef.current = rideContext ?? null;
  }, [rideContext]);
  const lastProgressAtRef = useRef(0);
  const lastCameraMoveAtRef = useRef(0);
  const headingForSmoothRef = useRef<number | null>(null);
  /**
   * Wall-clock timestamp (Date.now) of the most recent accepted GPS fix. The nav heartbeat /
   * stationary watchdog use this to keep the UI alive and to log when the OS stops delivering
   * callbacks (signal loss, killed location service, etc.) — independently of `position.timestamp`
   * which can occasionally regress on some devices.
   */
  const lastGoodFixWallTsRef = useRef(0);

  const routeParamsKey = useMemo(() => {
    const c0 = initialCoords.length >= 1 ? initialCoords[0] : null;
    const routeHead = c0 ? `${c0[0].toFixed(5)}_${c0[1].toFixed(5)}` : "x";
    return `${destination.lat.toFixed(5)}_${destination.lon.toFixed(5)}_${initialUserLocation.lat.toFixed(5)}_${initialUserLocation.lon.toFixed(5)}_${initialRouteInfo.distance}_${initialRouteInfo.duration}_${routeHead}`;
  }, [
    destination,
    initialUserLocation,
    initialRouteInfo.distance,
    initialRouteInfo.duration,
    initialCoords,
  ]);

  const gpsSmoother = useMemo(
    () => (USE_KALMAN_SMOOTHER ? createKalmanLatLonSmoother() : createWeightedEmaSmoother()),
    []
  );
  const lastGoodFixRef = useRef<{
    lat: number;
    lon: number;
    ts: number;
    accuracy?: number;
    speed?: number;
    bearing?: number;
  } | null>(null);
  const displayLocationRef = useRef<SmoothedPoint | null>(null);

  /** New destination / new preview route: clear GPS watch, reset map state, avoid stale start point. */
  // routeParamsKey encodes destination, user origin, route head, and leg stats — avoids extra runs from object identity churn.
  useEffect(() => {
    const w = watchIdRef.current;
    if (w != null) {
      NativeGeolocation.clearWatch(w);
    }
    watchIdRef.current = null;
    // smoother is tick-based; just forget previous state
    displayLocationRef.current = null;

    const ul = initialUserLocation;
    setUserLocation(ul);
    userLocationRef.current = ul;
    setSmoothedUserLocation(ul);
    gpsSmoother.reset(ul);
    displayLocationRef.current = ul;

    const coords: RouteLineStringCoords =
      initialCoords.length >= 2
        ? [...initialCoords]
        : [
            [ul.lon, ul.lat],
            [destination.lon, destination.lat],
          ];
    activeRouteCoordsRef.current = coords;
    legDistanceRef.current = initialRouteInfo.distance;
    legDurationRef.current = initialRouteInfo.duration;
    setRouteInfo(initialRouteInfo);
    setRemainingSeconds(Math.max(0, initialRouteInfo.duration));
    setRemainingRouteMeters(initialRouteInfo.distance);
    setDisplayRouteFC(lineStringToFeatureCollection(coords));

    setSessionPhase(navigationPhaseParam === "active" ? "active" : "preview");
    hasArrivedRef.current = false;
    tripDestArrivalPromptedRef.current = false;
    setTripArrivalKind(null);
    autoStartedLiveNavRef.current = false;
    lastProactiveRouteAtRef.current = 0;
    setShowArrivalModal(false);
    setRidePickupArrivedModal(false);
    passengerPickupArrivedFromServerRef.current = false;
    offRouteSinceRef.current = null;
    headingForSmoothRef.current = null;
    setDisplayHeading(null);
    setCurrentHeading(null);
    lastCameraMoveAtRef.current = 0;
    setIsFollowingUser(false);
    setShowFullRoute(false);
    lastGoodFixRef.current = null;
    stagnationAccRef.current = 0;
    publishedStagnationRef.current = 0;
    stagnationAnchorRef.current = null;
    stagnationLastGpsTsRef.current = 0;
    lastStagnationUiAtRef.current = 0;
    prevRemainingLengthMetersRef.current = null;
    passengerStagnationWallTsRef.current = 0;
    setStagnationDelaySec(0);
    setEtaTick(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- synced via routeParamsKey above
  }, [routeParamsKey, navigationPhaseParam, gpsSmoother]);

  /** After opening a route (or changing it), refine user dot from a fast GPS read without blocking the UI. */
  useEffect(() => {
    let alive = true;
    getNavigationRouteOrigin()
      .then((loc) => {
        if (!alive) return;
        setUserLocation(loc);
        userLocationRef.current = loc;
        setSmoothedUserLocation(loc);
        gpsSmoother.reset(loc);
        displayLocationRef.current = loc;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [routeParamsKey, gpsSmoother]);

  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    isNavigatingRef.current = sessionPhase === "active";
  }, [sessionPhase]);

  /** While active nav has flat geometry (stuck in traffic), keep ETA advancing with local time, not a frozen `useMemo`. */
  useEffect(() => {
    if (sessionPhase !== "active") return;
    const id = setInterval(() => {
      if (!screenActiveRef.current) return;
      setEtaTick((n) => n + 1);
    }, ETA_CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [sessionPhase, screenActiveRef]);

  /**
   * Live-navigation heartbeat / GPS watchdog.
   *
   * With `distanceFilter: 0` Android Fused normally delivers a fix every ~1 s even when the car
   * is stationary, so the GPS callback handles all derived-state updates. This effect is purely a
   * safety net for the "Google Maps at a red light" experience:
   *   1. Logs a warning if no fix has arrived for `GPS_STALL_WARNING_MS` (signal loss / throttle).
   *   2. If the GPS callback has been silent long enough that derived UI would otherwise freeze,
   *      recompute the route trim / remaining distance / remaining seconds from the last good
   *      fix so the panel keeps breathing. We do not move the marker — last fix is still last fix.
   *
   * The heartbeat intentionally does nothing when a recent GPS callback already did the work,
   * to avoid redundant React work / re-renders during normal driving.
   */
  useEffect(() => {
    if (sessionPhase !== "active") return;
    const id = setInterval(() => {
      if (!screenActiveRef.current) return;
      const now = Date.now();
      const lastFix = lastGoodFixWallTsRef.current;
      const fixAge = lastFix > 0 ? now - lastFix : -1;

      if (fixAge >= 0 && fixAge > GPS_STALL_WARNING_MS) {
        console.warn(
          "[GPS][nav] no GPS fix received for",
          Math.round(fixAge / 1000),
          "s — provider may be throttled or signal is lost"
        );
      } else if (GPS_DEBUG) {
        console.log("[GPS][nav][heartbeat] alive, last fix age(ms)=", fixAge);
      }

      // Only fall back to last-fix-driven recomputation if the live callback hasn't run recently.
      const lastProgress = lastProgressAtRef.current;
      if (lastProgress > 0 && now - lastProgress < NAV_HEARTBEAT_MS * 2) return;

      const last = lastGoodFixRef.current;
      const coords = activeRouteCoordsRef.current;
      if (!last || coords.length < 2) return;

      const { trimmed, remainingLengthMeters } = trimPolylineAheadOfUser(
        last.lat,
        last.lon,
        coords,
        SNAP_TRIM_M
      );
      activeRouteCoordsRef.current = trimmed;
      setDisplayRouteFC(lineStringToFeatureCollection(trimmed));
      setRemainingRouteMeters(remainingLengthMeters);
      const legD = legDistanceRef.current;
      const legT = legDurationRef.current;
      if (legD > 50) {
        const ratio = Math.min(1, Math.max(0, remainingLengthMeters / legD));
        setRemainingSeconds(Math.round(legT * ratio));
      }
    }, NAV_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [sessionPhase, screenActiveRef]);

  useEffect(() => {
    isFollowingRef.current = isFollowingUser;
  }, [isFollowingUser]);

  // Removed pulsing animation for navigation marker (custom marker uses lightweight glow)

  const fitCameraToRoute = useCallback(
    (coords: RouteLineStringCoords, padUser: boolean) => {
      if (routeExitInProgressRef.current || !screenActiveRef.current) return;
      if (coords.length < 1 || !cameraRef.current) return;
      let minLon = coords[0][0];
      let maxLon = coords[0][0];
      let minLat = coords[0][1];
      let maxLat = coords[0][1];
      coords.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      });
      const ul = userLocationRef.current;
      if (padUser && ul) {
        minLon = Math.min(minLon, ul.lon);
        maxLon = Math.max(maxLon, ul.lon);
        minLat = Math.min(minLat, ul.lat);
        maxLat = Math.max(maxLat, ul.lat);
      }
      if (destination) {
        minLon = Math.min(minLon, destination.lon);
        maxLon = Math.max(maxLon, destination.lon);
        minLat = Math.min(minLat, destination.lat);
        maxLat = Math.max(maxLat, destination.lat);
      }
      const centerLon = (minLon + maxLon) / 2;
      const centerLat = (minLat + maxLat) / 2;
      const maxDiff = Math.max(maxLon - minLon, maxLat - minLat);
      let zoomLevel = 13;
      if (maxDiff < 0.01) zoomLevel = 15;
      else if (maxDiff < 0.02) zoomLevel = 14;
      else if (maxDiff < 0.05) zoomLevel = 13;
      else zoomLevel = 12;
      cameraRef.current.setCamera({
        centerCoordinate: [centerLon, centerLat],
        zoomLevel,
        animationDuration: 1200,
      });
    },
    [destination]
  );

  useEffect(() => {
    if (sessionPhase === "preview" && initialCoords.length > 0 && mapLayersMounted && screenMapActive) {
      const tmr = setTimeout(() => {
        if (
          mapLayersMountedRef.current &&
          screenActiveRef.current &&
          !routeExitInProgressRef.current &&
          screenMapActive
        ) {
          fitCameraToRoute(initialCoords, true);
        }
      }, 400);
      return () => clearTimeout(tmr);
    }
  }, [sessionPhase, initialCoords, fitCameraToRoute, mapLayersMounted, screenMapActive, screenActiveRef]);

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
  };

  const formatEtaClock = (date: Date): string => {
    const locale = i18n.language === "he" ? "he-IL" : i18n.language === "ar" ? "ar" : "en-GB";
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  };

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => haversineMeters(lat1, lon1, lat2, lon2);

  const applyNewRoute = useCallback(
    (coords: RouteLineStringCoords, distanceM: number, durationS: number) => {
      if (!screenActiveRef.current) return;
      activeRouteCoordsRef.current = [...coords];
      legDistanceRef.current = distanceM;
      legDurationRef.current = durationS;
      setRouteInfo((prev) => ({
        ...prev,
        distance: distanceM,
        duration: durationS,
      }));
      const rem = Math.max(0, durationS);
      setRemainingSeconds(rem);
      setRemainingRouteMeters(distanceM);
      setDisplayRouteFC(lineStringToFeatureCollection(coords));
      stagnationAccRef.current = 0;
      publishedStagnationRef.current = 0;
      stagnationAnchorRef.current = null;
      stagnationLastGpsTsRef.current = 0;
      prevRemainingLengthMetersRef.current = null;
      lastStagnationUiAtRef.current = 0;
      passengerStagnationWallTsRef.current = 0;
      setStagnationDelaySec(0);
    },
    [screenActiveRef]
  );

  const maybeReroute = useCallback(
    async (lat: number, lon: number) => {
      if (!screenActiveRef.current) return;
      if (!isOnlineRef.current) return;
      const dest = destinationRef.current;
      if (!dest) return;
      const now = Date.now();
      if (now - lastRerouteAtRef.current < REROUTE_MIN_INTERVAL_MS) return;
      lastRerouteAtRef.current = now;
      setRerouting(true);
      try {
        const res = await fetchOsrmDrivingRoute({ lat, lon: lon }, dest);
        applyNewRoute(res.coordinates, res.distanceMeters, res.durationSeconds);
        lastProactiveRouteAtRef.current = Date.now();
        lastProgressAtRef.current = 0;
      } catch (e) {
        console.warn("Reroute failed", e);
      } finally {
        if (screenActiveRef.current) {
          setRerouting(false);
        }
      }
    },
    [applyNewRoute, screenActiveRef]
  );

  /** Full OSRM refresh from current position (throttled) — same engine as off-route, keeps ETA/distance in sync with the road network. */
  const refreshLiveRouteFromServer = useCallback(
    async (lat: number, lon: number) => {
      if (!screenActiveRef.current) return;
      if (!isOnlineRef.current) return;
      const dest = destinationRef.current;
      if (!dest) return;
      const now = Date.now();
      if (now - lastProactiveRouteAtRef.current < PROACTIVE_ROUTE_REFRESH_MS) return;
      lastProactiveRouteAtRef.current = now;
      lastRerouteAtRef.current = now;
      setRerouting(true);
      try {
        const res = await fetchOsrmDrivingRoute({ lat, lon: lon }, dest);
        applyNewRoute(res.coordinates, res.distanceMeters, res.durationSeconds);
        lastProgressAtRef.current = 0;
      } catch (e) {
        console.warn("Live route refresh failed", e);
      } finally {
        if (screenActiveRef.current) {
          setRerouting(false);
        }
      }
    },
    [applyNewRoute, screenActiveRef]
  );

  const leaveScreenToHome = useCallback(async () => {
    if (Platform.OS === "ios") {
      const homeRoute = await resolveHomeRootRoute();
      dispatchIosResetToHomeMap(navigation, homeRoute);
      return;
    }
    navigation.goBack();
  }, [navigation]);

  /**
   * iOS: no manual MapLibre unmount — wait, then reset to Home (no goBack).
   * Android: hide layers + goBack (unchanged).
   */
  const beginExitRouteDetails = useCallback(
    (logKey: string, leaveAction: () => void) => {
      if (routeExitInProgressRef.current) {
        logRouteDetailsMapExit("exit:ignoredDuplicate");
        return;
      }
      routeExitInProgressRef.current = true;
      setRouteExitLocked(true);
      screenActiveRef.current = false;

      Keyboard.dismiss();
      setRideDestModalOpen(false);
      clearLocationWatch();
      stopNavigationRefs();
      setRerouting(false);

      if (Platform.OS !== "ios") {
        hideOverlays();
        setMapLayersMounted(false);
        setScreenMapActive(false);
        resetMapAnnotationsReadyForPlatform();
        setSessionPhase("preview");
        suppressMapOverlays();
        leaveAction();
        return;
      }

      runIosRouteDetailsResetExit({
        logKey,
        resetToHome: leaveAction,
      });
    },
    [clearLocationWatch, hideOverlays, screenActiveRef, stopNavigationRefs]
  );

  const leaveRideNavScreen = useCallback(
    (action: () => void) => {
      beginExitRouteDetails("rideExit", action);
    },
    [beginExitRouteDetails]
  );

  const returnToMapFromPreview = useCallback(() => {
    logRouteDetailsMapExit("backToMap:pressed");
    beginExitRouteDetails("backToMap", () => {
      void leaveScreenToHome();
    });
  }, [beginExitRouteDetails, leaveScreenToHome]);

  useFocusEffect(
    useCallback(() => {
      routeExitInProgressRef.current = false;
      setRouteExitLocked(false);
      screenActiveRef.current = true;
      setScreenMapActive(true);
      setMapLayersMounted(true);
      return () => {
        screenActiveRef.current = false;
        clearLocationWatch();
      };
    }, [clearLocationWatch])
  );

  const stopLiveNavigationAndReturnHome = useCallback(() => {
    logRouteDetailsMapExit("stopNavigation:pressed");
    setDisplayHeading(null);
    setCurrentHeading(null);
    hasArrivedRef.current = false;
    setShowArrivalModal(false);
    clearNavigationRouteSnapshot();

    beginExitRouteDetails("stopNavigation", () => {
      if (Platform.OS === "ios") {
        void (async () => {
          await leaveScreenToHome();
          InteractionManager.runAfterInteractions(() => {
            logRouteDetailsMapExit("stopNavigation:emitHomeCleanup");
            emitLiveNavigationExit();
          });
        })();
        return;
      }
      emitLiveNavigationExit();
      navigation.goBack();
    });
  }, [beginExitRouteDetails, leaveScreenToHome, navigation]);

  const startLiveNavigation = useCallback(() => {
    if (!destination || routeExitInProgressRef.current) return;

    const wPrev = watchIdRef.current;
    if (wPrev != null) {
      NativeGeolocation.clearWatch(wPrev);
      watchIdRef.current = null;
    }

    setShowFullRoute(false);
    hasArrivedRef.current = false;
    setShowArrivalModal(false);
    headingForSmoothRef.current = null;
    setDisplayHeading(null);
    lastProgressAtRef.current = 0;
    lastCameraMoveAtRef.current = 0;

    const beginLiveNav = async () => {
      const storedUid = await AsyncStorage.getItem("userId");
      const driverUserIdForLocation = parseStoredUserId(storedUid);
      let lastDriverLocPostMs = 0;

      let fresh = userLocationRef.current ?? initialUserLocation;
      try {
        fresh = await getFreshPositionForNavigationStart();
      } catch {
        /* keep fallback above */
      }

      if (!screenActiveRef.current || routeExitInProgressRef.current) {
        logRouteDetailsMapExit("startNavigation:abortedAfterGps");
        return;
      }

      userLocationRef.current = fresh;
      setUserLocation(fresh);
      setSmoothedUserLocation(fresh);
      gpsSmoother.reset(fresh);
      displayLocationRef.current = fresh;

      const driftM = haversineMeters(
        fresh.lat,
        fresh.lon,
        initialUserLocation.lat,
        initialUserLocation.lon
      );

      if (driftM > ROUTE_ORIGIN_DRIFT_REFETCH_M) {
        if (isOnlineRef.current) {
          try {
            const res = await fetchOsrmDrivingRoute(fresh, destination);
            applyNewRoute(res.coordinates, res.distanceMeters, res.durationSeconds);
          } catch (e) {
            console.warn("Refetch route from fresh GPS failed", e);
            const fallbackCoords: RouteLineStringCoords =
              initialCoords.length >= 2
                ? [...initialCoords]
                : [
                    [fresh.lon, fresh.lat],
                    [destination.lon, destination.lat],
                  ];
            activeRouteCoordsRef.current = fallbackCoords;
            legDistanceRef.current = initialRouteInfo.distance;
            legDurationRef.current = initialRouteInfo.duration;
            setRouteInfo(initialRouteInfo);
            setRemainingSeconds(Math.max(0, initialRouteInfo.duration));
            setDisplayRouteFC(lineStringToFeatureCollection(fallbackCoords));
          }
        } else {
          const fallbackCoords: RouteLineStringCoords =
            initialCoords.length >= 2
              ? [...initialCoords]
              : [
                  [fresh.lon, fresh.lat],
                  [destination.lon, destination.lat],
                ];
          activeRouteCoordsRef.current = fallbackCoords;
          legDistanceRef.current = initialRouteInfo.distance;
          legDurationRef.current = initialRouteInfo.duration;
          setRouteInfo(initialRouteInfo);
          setRemainingSeconds(Math.max(0, initialRouteInfo.duration));
          setDisplayRouteFC(lineStringToFeatureCollection(fallbackCoords));
        }
      } else {
        const coords: RouteLineStringCoords =
          initialCoords.length >= 2
            ? [...initialCoords]
            : [
                [fresh.lon, fresh.lat],
                [destination.lon, destination.lat],
              ];
        activeRouteCoordsRef.current = coords;
        legDistanceRef.current = initialRouteInfo.distance;
        legDurationRef.current = initialRouteInfo.duration;
        setRouteInfo(initialRouteInfo);
        setRemainingSeconds(Math.max(0, initialRouteInfo.duration));
        setDisplayRouteFC(lineStringToFeatureCollection(coords));
      }

      stagnationAccRef.current = 0;
      publishedStagnationRef.current = 0;
      stagnationAnchorRef.current = null;
      stagnationLastGpsTsRef.current = 0;
      prevRemainingLengthMetersRef.current = null;
      lastStagnationUiAtRef.current = 0;
      passengerStagnationWallTsRef.current = 0;
      setStagnationDelaySec(0);

      setSessionPhase("active");
      setIsFollowingUser(true);
      lastProactiveRouteAtRef.current = Date.now();

      setTimeout(() => {
        if (routeExitInProgressRef.current || !screenActiveRef.current) return;
        if (cameraRef.current) {
          cameraRef.current.setCamera({
            centerCoordinate: [fresh.lon, fresh.lat],
            zoomLevel: 17.5,
            animationDuration: 520,
          });
        }
      }, 80);

      const id = NativeGeolocation.watchPosition(
        (position) => {
          if (routeExitInProgressRef.current || !screenActiveRef.current) {
            return;
          }
          const { latitude, longitude, heading, accuracy, speed } = position.coords;
          const course = (position.coords as { course?: number }).course;
          const ts = typeof position.timestamp === "number" ? position.timestamp : Date.now();
          const acc =
            accuracy != null && !Number.isNaN(accuracy) ? Math.max(0, accuracy) : undefined;
          if (GPS_DEBUG) {
            const stationary = speed != null && !Number.isNaN(speed) && speed < 0.5;
            console.log("[GPS][watch] raw", {
              latitude,
              longitude,
              acc,
              ts,
              heading,
              speed,
              course,
              // Surfaces in logcat that callbacks keep firing while the car is stopped — exactly
              // the proof we want when debugging "the route freezes at red lights".
              stationary,
            });
          }

          // 1) Stale / out-of-order rejection
          const prevGood = lastGoodFixRef.current;
          if (prevGood && ts <= prevGood.ts) {
            if (GPS_DEBUG) console.log("[GPS][watch] Rejected: stale timestamp", { ts, prev: prevGood.ts });
            return;
          }

          // 2) Accuracy gating (do not update UI/route with low-quality fixes)
          if (acc != null && acc > MAX_ACCEPTABLE_ACCURACY_M) {
            if (GPS_DEBUG) console.log("[GPS][watch] Rejected: accuracy too high", { acc });
            return;
          }

          // 3) Jump / invalid movement filtering (teleports)
          if (prevGood) {
            const dtS = Math.max(0, (ts - prevGood.ts) / 1000);
            if (dtS > 0.05) {
              const dM = haversineMeters(prevGood.lat, prevGood.lon, latitude, longitude);
              const impliedMps = dM / dtS;
              if (
                impliedMps > MAX_IMPLIED_SPEED_MPS ||
                (dM > MAX_JUMP_METERS && dtS < MAX_JUMP_WINDOW_S)
              ) {
                if (GPS_DEBUG) {
                  console.log("[GPS][watch] Rejected: jump detected", { dM, dtS, impliedMps });
                }
                return;
              }
            }
          }

          const newLocation = { lat: latitude, lon: longitude };
          lastGoodFixRef.current = {
            lat: latitude,
            lon: longitude,
            ts,
            accuracy: acc,
            speed: speed != null && !Number.isNaN(speed) ? speed : undefined,
          };
          lastGoodFixWallTsRef.current = Date.now();

          setUserLocation(newLocation);
          userLocationRef.current = newLocation;

          const rcLoc = rideContextRef.current;
          if (
            driverUserIdForLocation != null &&
            rcLoc?.role === "DRIVER" &&
            rcLoc.mode !== "pickup"
          ) {
            const nowMs = Date.now();
            if (nowMs - lastDriverLocPostMs >= 2500) {
              lastDriverLocPostMs = nowMs;
              void updateDriverLocation({
                driver_user_id: driverUserIdForLocation,
                lat: latitude,
                lon: longitude,
              }).catch(() => {});
            }
          }

          const dest = destinationRef.current;
          if (dest && !hasArrivedRef.current) {
            const dDest = calculateDistance(latitude, longitude, dest.lat, dest.lon);
            if (dDest <= ARRIVAL_RADIUS_M) {
              hasArrivedRef.current = true;
              const rc = rideContextRef.current;
              if (rc) {
                // Ride-only dedicated arrival UI; do NOT show the generic personal-navigation popup.
                if (rc.mode === "pickup") {
                  setRidePickupArrivedModal(true);
                } else {
                  setTripArrivalKind("driver");
                  setRideTripArrivedModal(true);
                }
              } else {
                setShowArrivalModal(true);
              }
              const wid = watchIdRef.current;
              if (wid != null) {
                NativeGeolocation.clearWatch(wid);
              }
              watchIdRef.current = null;
              setSessionPhase("preview");
              setIsFollowingUser(false);
              isNavigatingRef.current = false;
              return;
            }
          }

          let bearing: number | null = null;
          const speedMps = speed != null && !Number.isNaN(speed) ? speed : 0;
          if (speedMps > 1.2 && course != null && !Number.isNaN(course) && course >= 0) {
            bearing = course;
          } else if (heading != null && !Number.isNaN(heading) && heading >= 0) {
            bearing = heading;
          } else {
            const prev = prevGood;
            if (prev) {
              const dtS = Math.max(0, (ts - prev.ts) / 1000);
              // Heading from movement vector (better than nothing when platform heading is noisy/absent)
              if (dtS >= 0.6) {
                const movedM = haversineMeters(prev.lat, prev.lon, latitude, longitude);
                if (movedM >= 3) {
                  bearing = bearingDegrees(prev.lat, prev.lon, latitude, longitude);
                }
              }
            }
          }

          const coords = activeRouteCoordsRef.current;
          if (coords.length >= 2) {
            const [lon1, lat1] = coords[1];
            if (bearing === null) {
              bearing = bearingDegrees(latitude, longitude, lat1, lon1);
            }
          }
          if (bearing !== null) {
            setCurrentHeading(bearing);
            const sm = smoothHeadingStep(headingForSmoothRef.current, bearing, 0.38);
            headingForSmoothRef.current = sm;
            setDisplayHeading(sm);
          }

          const distToRoute = minDistanceToPolylineMeters(latitude, longitude, coords);
          if (GPS_DEBUG) console.log("[GPS][watch] distToRoute(raw)", distToRoute);
          if (distToRoute > OFF_ROUTE_THRESHOLD_M) {
            if (offRouteSinceRef.current === null) {
              offRouteSinceRef.current = Date.now();
            } else if (Date.now() - offRouteSinceRef.current > 2800) {
              offRouteSinceRef.current = null;
              maybeReroute(latitude, longitude);
            }
          } else if (distToRoute < ON_ROUTE_THRESHOLD_M) {
            offRouteSinceRef.current = null;
          }

          // 4) Smooth the *displayed* point (weighted by accuracy/speed)
          const smoothed = gpsSmoother.update({
            lat: latitude,
            lon: longitude,
            accuracy: acc,
            speed: speedMps,
            timestampMs: ts,
          });

          // 5) Optional snapping (display only): keep raw GPS for logic/off-route detection
          let displayPoint: SmoothedPoint = smoothed;
          if (acc == null || acc <= MAX_ACCEPTABLE_ACCURACY_M) {
            const snapRes = snapToPolylinePoint(smoothed.lat, smoothed.lon, coords);
            if (snapRes && snapRes.distanceMeters <= SNAP_TO_ROUTE_THRESHOLD_M) {
              if (GPS_DEBUG) {
                console.log("[GPS][watch] snapped", { d: snapRes.distanceMeters, point: snapRes.point });
              }
              displayPoint = snapRes.point;
            }
          }

          // No movement threshold during active navigation: even a fix that lands at the same
          // smoothed coordinate (driver stopped at a light) is intentionally pushed through so the
          // marker, heading, and React subtree stay "alive" — exactly like Google Maps. Outside of
          // active nav we keep the ~0.5 m gate to avoid useless re-renders during preview.
          const prevDisp = displayLocationRef.current;
          const isActiveNav = isNavigatingRef.current;
          if (
            isActiveNav ||
            !prevDisp ||
            haversineMeters(prevDisp.lat, prevDisp.lon, displayPoint.lat, displayPoint.lon) >= 0.5
          ) {
            displayLocationRef.current = displayPoint;
            setSmoothedUserLocation(displayPoint);
          }

          const now = Date.now();
          const shouldProgress =
            coords.length >= 2 &&
            (lastProgressAtRef.current === 0 || now - lastProgressAtRef.current > 3200);
          if (shouldProgress) {
            lastProgressAtRef.current = now;
            const { trimmed, remainingLengthMeters } = trimPolylineAheadOfUser(
              latitude,
              longitude,
              coords,
              SNAP_TRIM_M
            );
            activeRouteCoordsRef.current = trimmed;
            setDisplayRouteFC(lineStringToFeatureCollection(trimmed));
            const legD = legDistanceRef.current;
            const legT = legDurationRef.current;
            const ratio =
              legD > 50 ? Math.min(1, Math.max(0, remainingLengthMeters / legD)) : 0;
            const remSec = Math.round(legT * ratio);
            setRemainingSeconds(remSec);
            setRemainingRouteMeters(remainingLengthMeters);

            const prevRem = prevRemainingLengthMetersRef.current;
            if (prevRem != null && prevRem - remainingLengthMeters > 30) {
              stagnationAccRef.current = 0;
              publishedStagnationRef.current = 0;
              setStagnationDelaySec(0);
              stagnationAnchorRef.current = { lat: latitude, lon: longitude };
            }
            prevRemainingLengthMetersRef.current = remainingLengthMeters;
          }

          if (isNavigatingRef.current) {
            const tPro = Date.now();
            if (tPro - lastProactiveRouteAtRef.current >= PROACTIVE_ROUTE_REFRESH_MS) {
              void refreshLiveRouteFromServer(latitude, longitude);
            }
          }

          {
            const anc0 = stagnationAnchorRef.current;
            if (anc0 == null) {
              stagnationAnchorRef.current = { lat: latitude, lon: longitude };
              stagnationLastGpsTsRef.current = ts;
            } else {
              const lastTs0 = stagnationLastGpsTsRef.current;
              const dtGps = Math.max(0, (ts - lastTs0) / 1000);
              stagnationLastGpsTsRef.current = ts;
              if (dtGps >= 0.12) {
                const movedA = haversineMeters(anc0.lat, anc0.lon, latitude, longitude);
                const isMovingA =
                  movedA >= STAGNATION_CLEAR_MOVE_M || speedMps > STAGNATION_MAX_SPEED_MPS;
                if (isMovingA) {
                  stagnationAccRef.current = 0;
                  publishedStagnationRef.current = 0;
                  setStagnationDelaySec(0);
                  stagnationAnchorRef.current = { lat: latitude, lon: longitude };
                } else {
                  stagnationAccRef.current = Math.min(
                    STAGNATION_MAX_DELAY_SEC,
                    stagnationAccRef.current + dtGps
                  );
                  const target = Math.min(
                    STAGNATION_MAX_DELAY_SEC,
                    Math.round(stagnationAccRef.current)
                  );
                  if (target !== publishedStagnationRef.current) {
                    const tUi = Date.now();
                    if (
                      tUi - lastStagnationUiAtRef.current >= 1800 ||
                      Math.abs(target - publishedStagnationRef.current) >= 3
                    ) {
                      lastStagnationUiAtRef.current = tUi;
                      publishedStagnationRef.current = target;
                      setStagnationDelaySec(target);
                    }
                  }
                }
              }
            }
          }

          // Camera follow (short animation; throttled; based on accepted fixes only)
          const nav = isNavigatingRef.current;
          const follow = isFollowingRef.current;
          if (
            cameraRef.current &&
            nav &&
            follow &&
            !routeExitInProgressRef.current &&
            screenActiveRef.current
          ) {
            const camNow = Date.now();
            if (camNow - lastCameraMoveAtRef.current >= 220) {
              lastCameraMoveAtRef.current = camNow;
              const brg = headingForSmoothRef.current;
              const cameraOptions: Record<string, unknown> = {
                centerCoordinate: [displayPoint.lon, displayPoint.lat],
                zoomLevel: 17.2,
                animationDuration: 250,
              };
              if (brg != null) {
                cameraOptions.bearing = brg;
              }
              cameraRef.current.setCamera(cameraOptions);
            }
          }
        },
        (error) => {
          console.error("GPS tracking error:", error);
          if (GPS_DEBUG) console.log("[GPS][watch] error callback", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
          // distanceFilter MUST be 0 for live navigation. Any value > 0 maps to
          // FusedLocationProviderClient.setMinUpdateDistanceMeters(...) on Android and causes the OS
          // to suppress callbacks while the user is stopped — the route freezes at red lights.
          distanceFilter: 0,
          interval: LIVE_NAV_GPS_INTERVAL_MS,
        } as Parameters<any>[2]
      );

      watchIdRef.current = id;
    };

    beginLiveNav().catch((e) => console.warn("startLiveNavigation failed", e));
  }, [
    applyNewRoute,
    destination,
    initialCoords,
    initialRouteInfo,
    initialUserLocation,
    gpsSmoother,
    maybeReroute,
    refreshLiveRouteFromServer,
  ]);

  useEffect(() => {
    return () => {
      const w = watchIdRef.current;
      if (w != null) {
        NativeGeolocation.clearWatch(w);
      }
      watchIdRef.current = null;
    };
  }, []);

  // Regular user / business owner on a shared ride: follow the driver's live position (pickup
  // and trip to destination) so the map + ETA match the car — same idea as `RideTrackingMap` pickup.
  const isPassengerRideFollower = rideContext?.role === "REGULAR";
  const isPassengerPickup = isPassengerRideFollower && rideContext?.mode === "pickup";
  /** In-trip to final destination: passenger view tracks driver, not the passenger's phone GPS. */
  const isPassengerTripFollower =
    isPassengerRideFollower && rideContext?.mode !== "pickup";

  const startPassengerRideFollowerTracking = useCallback(() => {
    if (!destination) return;
    const wPrev = watchIdRef.current;
    if (wPrev != null) {
      NativeGeolocation.clearWatch(wPrev);
      watchIdRef.current = null;
    }
    setShowFullRoute(false);
    setShowArrivalModal(false);
    if (rideContext?.mode === "pickup") {
      // Pickup leg: passenger phone must not trigger arrival; driver marks arrived separately.
      hasArrivedRef.current = true;
      tripDestArrivalPromptedRef.current = false;
    } else {
      // Trip to destination: arrival is derived from driver's live position vs destination.
      hasArrivedRef.current = false;
      tripDestArrivalPromptedRef.current = false;
    }
    setSessionPhase("active");
    setIsFollowingUser(true);
    isNavigatingRef.current = true;
    lastProgressAtRef.current = 0;
    lastCameraMoveAtRef.current = 0;
    lastProactiveRouteAtRef.current = Date.now();
    stagnationAccRef.current = 0;
    publishedStagnationRef.current = 0;
    stagnationAnchorRef.current = null;
    stagnationLastGpsTsRef.current = 0;
    prevRemainingLengthMetersRef.current = null;
    lastStagnationUiAtRef.current = 0;
    passengerStagnationWallTsRef.current = 0;
    setStagnationDelaySec(0);
  }, [destination, rideContext?.mode]);

  useEffect(() => {
    if (autoStartedLiveNavRef.current) return;
    if (sessionPhase !== "active") return;
    if (!rideContext) return;
    autoStartedLiveNavRef.current = true;
    if (isPassengerRideFollower) {
      startPassengerRideFollowerTracking();
    } else {
      startLiveNavigation();
    }
  }, [
    sessionPhase,
    rideContext,
    isPassengerRideFollower,
    startLiveNavigation,
    startPassengerRideFollowerTracking,
  ]);

  // Passenger (pickup or trip): poll `driver_live_lat/lon` and reuse trim/reroute/camera. Trip
  // arrival at the final stop uses the same radius as the driver, based on the car position.
  useEffect(() => {
    if (!isPassengerRideFollower) return;
    if (!destination) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const stored = await AsyncStorage.getItem("userId");
        const uid = parseStoredUserId(stored);
        if (uid == null) return;
        const latest = await getRegularLatestRideRequest(uid);
        if (cancelled) return;
        if (!latest) return;
        if (
          rideContext?.rideRequestId != null &&
          latest.id !== rideContext.rideRequestId
        ) {
          return;
        }

        if (
          rideContext?.mode === "pickup" &&
          normalizeRideRequestStatus(latest.status) === "arrived" &&
          !passengerPickupArrivedFromServerRef.current
        ) {
          passengerPickupArrivedFromServerRef.current = true;
          hasArrivedRef.current = true;
          isNavigatingRef.current = false;
          isFollowingRef.current = false;
          setSessionPhase("preview");
          setIsFollowingUser(false);
          setRidePickupArrivedModal(true);
          return;
        }

        const lat = latest.driver_live_lat;
        const lon = latest.driver_live_lon;
        if (
          lat == null ||
          lon == null ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lon)
        ) {
          return;
        }
        const newLoc = { lat, lon };
        setUserLocation(newLoc);
        setSmoothedUserLocation(newLoc);
        userLocationRef.current = newLoc;
        displayLocationRef.current = newLoc;

        const coords = activeRouteCoordsRef.current;
        if (coords.length >= 2) {
          const { trimmed, remainingLengthMeters } = trimPolylineAheadOfUser(
            lat,
            lon,
            coords,
            SNAP_TRIM_M
          );
          activeRouteCoordsRef.current = trimmed;
          setDisplayRouteFC(lineStringToFeatureCollection(trimmed));
          const legD = legDistanceRef.current;
          const legT = legDurationRef.current;
          const ratio =
            legD > 50 ? Math.min(1, Math.max(0, remainingLengthMeters / legD)) : 0;
          setRemainingSeconds(Math.round(legT * ratio));
          setRemainingRouteMeters(remainingLengthMeters);

          const prevRem = prevRemainingLengthMetersRef.current;
          if (prevRem != null && prevRem - remainingLengthMeters > 30) {
            stagnationAccRef.current = 0;
            publishedStagnationRef.current = 0;
            setStagnationDelaySec(0);
            stagnationAnchorRef.current = { lat, lon };
          }
          prevRemainingLengthMetersRef.current = remainingLengthMeters;

          const distToRoute = minDistanceToPolylineMeters(lat, lon, coords);
          if (distToRoute > OFF_ROUTE_THRESHOLD_M) {
            if (offRouteSinceRef.current === null) {
              offRouteSinceRef.current = Date.now();
            } else if (Date.now() - offRouteSinceRef.current > 2800) {
              offRouteSinceRef.current = null;
              void maybeReroute(lat, lon);
            }
          } else if (distToRoute < ON_ROUTE_THRESHOLD_M) {
            offRouteSinceRef.current = null;
          }
        }

        {
          const pWall = Date.now();
          if (passengerStagnationWallTsRef.current === 0) {
            passengerStagnationWallTsRef.current = pWall;
            if (stagnationAnchorRef.current == null) {
              stagnationAnchorRef.current = { lat, lon };
            }
          } else {
            const pLastW = passengerStagnationWallTsRef.current;
            const pDtS = Math.max(0, (pWall - pLastW) / 1000);
            passengerStagnationWallTsRef.current = pWall;
            if (pDtS >= 0.2) {
              const anc0 = stagnationAnchorRef.current;
              if (anc0 == null) {
                stagnationAnchorRef.current = { lat, lon };
              } else {
                const movedA = haversineMeters(anc0.lat, anc0.lon, lat, lon);
                const implied = pDtS > 0.05 ? movedA / pDtS : 0;
                if (movedA >= STAGNATION_CLEAR_MOVE_M || implied > STAGNATION_MAX_SPEED_MPS) {
                  stagnationAccRef.current = 0;
                  publishedStagnationRef.current = 0;
                  setStagnationDelaySec(0);
                  stagnationAnchorRef.current = { lat, lon };
                } else {
                  stagnationAccRef.current = Math.min(
                    STAGNATION_MAX_DELAY_SEC,
                    stagnationAccRef.current + pDtS
                  );
                  const target = Math.min(
                    STAGNATION_MAX_DELAY_SEC,
                    Math.round(stagnationAccRef.current)
                  );
                  if (target !== publishedStagnationRef.current) {
                    const tUi = Date.now();
                    if (
                      tUi - lastStagnationUiAtRef.current >= 1800 ||
                      Math.abs(target - publishedStagnationRef.current) >= 3
                    ) {
                      lastStagnationUiAtRef.current = tUi;
                      publishedStagnationRef.current = target;
                      setStagnationDelaySec(target);
                    }
                  }
                }
              }
            }
          }
        }

        if (
          cameraRef.current &&
          isFollowingRef.current &&
          !routeExitInProgressRef.current &&
          screenActiveRef.current
        ) {
          const now = Date.now();
          if (now - lastCameraMoveAtRef.current >= 500) {
            lastCameraMoveAtRef.current = now;
            cameraRef.current.setCamera({
              centerCoordinate: [lon, lat],
              zoomLevel: 17.2,
              animationDuration: 450,
            });
          }
        }

        if (
          rideContext?.mode !== "pickup" &&
          destinationRef.current &&
          !tripDestArrivalPromptedRef.current
        ) {
          const dest = destinationRef.current;
          const dDest = haversineMeters(lat, lon, dest.lat, dest.lon);
          if (dDest <= ARRIVAL_RADIUS_M) {
            tripDestArrivalPromptedRef.current = true;
            hasArrivedRef.current = true;
            setTripArrivalKind("passenger");
            setRideTripArrivedModal(true);
            setSessionPhase("preview");
            isNavigatingRef.current = false;
            setIsFollowingUser(false);
          }
        }
      } catch {
        /* transient polling error – will retry on next interval */
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isPassengerRideFollower, destination, rideContext?.rideRequestId, rideContext?.mode, maybeReroute]);

  // Passenger follower has no GPS watch — periodic full OSRM refresh from driver's last known point.
  useEffect(() => {
    if (!isPassengerRideFollower) return;
    if (sessionPhase !== "active") return;
    if (!destination) return;
    const id = setInterval(() => {
      const ul = userLocationRef.current;
      if (!ul) return;
      void refreshLiveRouteFromServer(ul.lat, ul.lon);
    }, PROACTIVE_ROUTE_REFRESH_MS);
    return () => clearInterval(id);
  }, [isPassengerRideFollower, sessionPhase, destination, refreshLiveRouteFromServer]);

  /** Persist trimmed route locally while navigating (crash / recovery); gated to active phase only. */
  useEffect(() => {
    if (sessionPhase !== "active") return;
    const persist = () => {
      const dest = destinationRef.current;
      if (!dest) return;
      const coords = activeRouteCoordsRef.current;
      if (coords.length < 2) return;
      saveNavigationRouteSnapshot({
        version: 1,
        routeLine: coords.map((p) => [p[0], p[1]] as [number, number]),
        destination: { lat: dest.lat, lon: dest.lon, name: dest.name },
        legDistanceMeters: legDistanceRef.current,
        legDurationSeconds: legDurationRef.current,
        updatedAt: Date.now(),
      });
    };
    persist();
    const id = setInterval(persist, 15000);
    return () => clearInterval(id);
  }, [sessionPhase]);

  // Trip to destination (driver): when the passenger completes the ride, return to requests.
  const isDriverOnTripNav =
    rideContext?.role === "DRIVER" && rideContext?.mode !== "pickup";
  useEffect(() => {
    if (!isDriverOnTripNav || !rideContext) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const stored = await AsyncStorage.getItem("userId");
        const uid = parseStoredUserId(stored);
        if (uid == null) return;
        const list = await getDriverRideRequests(uid);
        if (cancelled) return;
        const row = list.find((r) => r.id === rideContext.rideRequestId);
        if (row && normalizeRideRequestStatus(row.status) === "completed") {
          if (!screenActiveRef.current) return;
          leaveRideNavScreen(() => navigateToUserRideRequestsTab(navigation as any, "DRIVER"));
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isDriverOnTripNav, rideContext, navigation, leaveRideNavScreen]);

  /**
   * Cancellation watchdog (both roles, all ride modes): if the ride request
   * we are currently navigating for becomes `cancelled` (or disappears entirely)
   * on the backend — regardless of which side cancelled — eject the user out
   * of the live nav screen back to their ride requests tab. The global
   * listeners surface the "ride was cancelled" alert; this effect is purely
   * about *not* leaving the user stuck on a stale live navigation map.
   */
  useEffect(() => {
    if (!rideContext) return;
    let stopped = false;
    const targetId = rideContext.rideRequestId;
    const role = rideContext.role;

    const tick = async () => {
      try {
        const stored = await AsyncStorage.getItem("userId");
        const uid = parseStoredUserId(stored);
        if (uid == null) return;

        let cancelledOrGone = false;
        if (role === "DRIVER") {
          const list = await getDriverRideRequests(uid);
          if (stopped) return;
          const row = list.find((r) => r.id === targetId);
          if (!row) {
            cancelledOrGone = true;
          } else if (normalizeRideRequestStatus(row.status) === "cancelled") {
            cancelledOrGone = true;
          }
        } else {
          const latest = await getRegularLatestRideRequest(uid);
          if (stopped) return;
          if (!latest || latest.id !== targetId) {
            cancelledOrGone = true;
          } else if (normalizeRideRequestStatus(latest.status) === "cancelled") {
            cancelledOrGone = true;
          }
        }
        if (cancelledOrGone && !stopped) {
          stopped = true;
          if (!screenActiveRef.current) return;
          leaveRideNavScreen(() => navigateToUserRideRequestsTab(navigation as any, role));
        }
      } catch {
        /* network blip — try again next tick */
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 3500);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [rideContext, navigation, leaveRideNavScreen]);

  // Pickup arrival: fire-and-forget markRideArrived + 5s auto-close + return to driver requests.
  useEffect(() => {
    if (!ridePickupArrivedModal) return;
    if (!rideContext || rideContext.mode !== "pickup") return;
    let cancelled = false;

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem("userId");
        const did = parseStoredUserId(stored);
        if (did != null && rideContext.role === "DRIVER") {
          try {
            await markRideArrived(rideContext.rideRequestId, did);
          } catch {
            // Server may already be in a later state; swallow — popup/navigation still proceed.
          }
        }
      } finally {
        if (cancelled) return;
      }
    })();

    const closeTimer = setTimeout(() => {
      if (cancelled) return;
      setRidePickupArrivedModal(false);
      leaveRideNavScreen(() => navigateToUserRideRequestsTab(navigation as any, rideContext.role));
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(closeTimer);
    };
  }, [ridePickupArrivedModal, rideContext, navigation, leaveRideNavScreen]);

  const onRideTripArrivedConfirm = useCallback(async () => {
    if (!rideContext || completingRideTrip) return;
    if (rideContext.role !== "REGULAR") {
      return;
    }
    setCompletingRideTrip(true);
    try {
      const stored = await AsyncStorage.getItem("userId");
      const uid = parseStoredUserId(stored);
      if (uid != null) {
        try {
          await completeRideTrip({
            ride_request_id: rideContext.rideRequestId,
            regular_user_id: uid,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/already completed/i.test(msg)) {
            appAlert(t("error"), t("ride_trip_complete_failed"), [
              { text: t("ok") || "OK" },
            ]);
            setCompletingRideTrip(false);
            return;
          }
        }
      }
      setRideTripArrivedModal(false);
      setTripArrivalKind(null);
      leaveRideNavScreen(() => navigateToUserRideRequestsTab(navigation as any, rideContext.role));
    } finally {
      setCompletingRideTrip(false);
    }
  }, [rideContext, completingRideTrip, leaveRideNavScreen, navigation, t]);

  const onDriverTripArrivedAck = useCallback(() => {
    setRideTripArrivedModal(false);
    setTripArrivalKind(null);
  }, []);

  const showFullRouteOverview = () => {
    const coords = activeRouteCoordsRef.current;
    if (coords.length > 0) {
      fitCameraToRoute(coords, true);
      setShowFullRoute(true);
      setIsFollowingUser(false);
    }
  };

  const isPreview = sessionPhase === "preview";
  const isActive = sessionPhase === "active";

  /** Model-time remaining (trim × OSRM) + wall-clock when GPS shows almost no travel (traffic, waiting). */
  const effectiveRemainingSec = useMemo(() => {
    return Math.min(
      24 * 3600,
      Math.max(0, Math.round(remainingSeconds) + Math.round(stagnationDelaySec))
    );
  }, [remainingSeconds, stagnationDelaySec]);

  const routeProgress01 = useMemo(() => {
    if (!isActive || !routeInfo.duration || routeInfo.duration <= 0) return 0;
    return Math.max(0, Math.min(1, 1 - effectiveRemainingSec / routeInfo.duration));
  }, [isActive, routeInfo.duration, effectiveRemainingSec]);

  const navigationMetaLine = useMemo(
    () =>
      isActive
        ? `${formatDuration(effectiveRemainingSec)} · ${formatDistance(remainingRouteMeters)}`
        : `${formatDuration(routeInfo.duration)} · ${formatDistance(routeInfo.distance)}`,
    [isActive, routeInfo.duration, routeInfo.distance, effectiveRemainingSec, remainingRouteMeters]
  );

  const navPanelStats = useMemo((): [NavInfoStat, NavInfoStat, NavInfoStat] => {
    const arrivalD = new Date(Date.now() + effectiveRemainingSec * 1000);
    const arrivalStr = formatEtaClock(arrivalD);
    return [
      {
        label: t("remaining_time") || "Remaining time",
        value: t("minutes_remaining_short", {
          minutes: Math.max(1, Math.round(effectiveRemainingSec / 60)),
        }),
        icon: "time-outline",
        highlight: true,
      },
      {
        label: t("remaining_distance") || "Remaining distance",
        value: formatDistance(remainingRouteMeters),
        icon: "navigate-outline",
      },
      {
        label: t("eta_arrival") || "ETA",
        value: arrivalStr,
        icon: "location-outline",
      },
    ];
  }, [t, effectiveRemainingSec, remainingRouteMeters, i18n.language, etaTick]);

  const onRegionWillChange = (feature: any) => {
    if (routeExitInProgressRef.current || !screenActiveRef.current) return;
    try {
      const isUser = feature?.properties?.isUserInteraction === true;
      if (isActive && isUser) {
        setIsFollowingUser(false);
      }
      const bearing = feature?.properties?.bearing ?? 0;
      setMapBearing(bearing);
    } catch {
      /* ignore */
    }
  };

  const headerTitle = isPreview
    ? t("route_preview_title") || "Route preview"
    : t("route_details") || "Route Details";

  const markerBearing = (displayHeading ?? currentHeading ?? 0) - (mapBearing || 0);

  /**
   * First coordinate of the displayed route as `[lon, lat]`.
   * Used both as the start endpoint marker and as the target of the dotted
   * "off-road" connector when the live position is not exactly on the road.
   */
  const firstRouteCoord = useMemo<[number, number] | null>(() => {
    const coords = displayRouteFC?.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length === 0) return null;
    const [lon, lat] = coords[0] as [number, number];
    if (typeof lon !== "number" || typeof lat !== "number") return null;
    return [lon, lat];
  }, [displayRouteFC]);

  /** Localized remaining ETA for the on-route chip (active navigation only). */
  const mapEtaBubbleLabel = useMemo(() => {
    if (!isActive) return null;
    const sec = effectiveRemainingSec;
    if (sec <= 0) return null;
    const totalMin = Math.max(1, Math.round(sec / 60));
    if (totalMin < 60) {
      return t("nav_on_route_eta_minutes", { minutes: totalMin });
    }
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (m === 0) {
      return t("nav_on_route_eta_hours_only", { hours: h });
    }
    return t("nav_on_route_eta_hours_mins", { hours: h, minutes: m });
  }, [isActive, effectiveRemainingSec, t]);

  /** ~mid-remaining path — readable ahead of the vehicle without covering the destination. */
  const routeEtaBubbleCoord = useMemo<[number, number] | null>(() => {
    if (!mapEtaBubbleLabel) return null;
    const coords = displayRouteFC?.features?.[0]?.geometry?.coordinates as RouteLineStringCoords | undefined;
    if (!coords || coords.length < 2) return null;
    return pointAtFractionAlongPolyline(coords, 0.36);
  }, [mapEtaBubbleLabel, displayRouteFC]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        {rideContext ? (
          <TouchableOpacity
            style={styles.rideHeaderBackBtn}
            onPress={() =>
              leaveRideNavScreen(() => navigateToUserRideRequestsTab(navigation as any, rideContext.role))
            }
            hitSlop={12}
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={26} color={DARK_TEAL} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>{headerTitle}</Text>
      </View>

      <View style={styles.mapContainer}>
        {screenMapActive ? (
        <FocusedMapView
          ref={mapRef}
          style={styles.map}
          mapStyle={MAP_STYLE_URL}
          scrollEnabled={!isActive || !isFollowingUser}
          pitchEnabled={false}
          rotateEnabled={true}
          logoEnabled={false}
          attributionEnabled={false}
          onRegionWillChange={onRegionWillChange}
        >
          {mapLayersMounted ? (
          <>
          <Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: userLocation
                ? [userLocation.lon, userLocation.lat]
                : [34.83, 31.24],
              zoomLevel: 13,
            }}
            animationMode="flyTo"
          />

          {showOverlays && displayRouteFC && (
            <ShapeSource id="route" shape={displayRouteFC}>
              <LineLayer
                id="routeLineOutline"
                style={{
                  lineColor: "#1A73E8",
                  lineWidth: 14,
                  lineCap: "round",
                  lineJoin: "round",
                  lineOpacity: isActive ? 0.4 : 0,
                } as any}
              />
              <LineLayer
                id="routeLine"
                style={{
                  lineColor: isActive ? NAV_BLUE : DARK_TEAL,
                  lineWidth: isActive ? 10 : 5,
                  lineCap: "round",
                  lineJoin: "round",
                  lineOpacity: isActive ? 1 : 0.85,
                } as any}
              />
            </ShapeSource>
          )}

          {/* Dotted connector from the live "you" position to the first point of
              the actual road route — only renders when the user is visibly off
              the road (haversine threshold inside the component). */}
          {showOverlays && isActive && firstRouteCoord && (
            <OffRoutePathConnector
              id="route_connector_active"
              from={{ lat: smoothedUserLocation.lat, lon: smoothedUserLocation.lon }}
              to={firstRouteCoord}
              color={NAV_BLUE}
              width={3.5}
            />
          )}

          {/* Start of the road route — small circle at the actual road origin. */}
          {showOverlays && firstRouteCoord && (
            <PointAnnotation id="route_start" coordinate={firstRouteCoord}>
              <RouteEndpointMarker
                variant="start"
                color={isActive ? NAV_BLUE : DARK_TEAL}
              />
            </PointAnnotation>
          )}

          {showOverlays && routeEtaBubbleCoord && mapEtaBubbleLabel ? (
            <PointAnnotation
              id="route_eta_on_path"
              coordinate={routeEtaBubbleCoord}
              anchor={{ x: 0.5, y: 1 }}
            >
              <RouteEtaOnMapLabel label={mapEtaBubbleLabel} accentColor={NAV_BLUE} />
            </PointAnnotation>
          ) : null}

          {/* Active "you" car marker driven by smoothed GPS + bearing. */}
          {showOverlays && userLocation && isActive && (
            <PointAnnotation
              id="route_nav_user"
              coordinate={[smoothedUserLocation.lon, smoothedUserLocation.lat]}
            >
              <NavigationMarker bearingDeg={markerBearing} variant="minimal" />
            </PointAnnotation>
          )}

          {/* Destination drop point — clear flag inside a brand-teal disc. */}
          {showOverlays && destination && (
            <PointAnnotation id="destination" coordinate={[destination.lon, destination.lat]}>
              <RouteEndpointMarker variant="end" />
            </PointAnnotation>
          )}
          </>
          ) : null}
        </FocusedMapView>
        ) : (
          <View style={styles.map} />
        )}

        {rideContext ? (
          <View style={styles.rideOverlay}>
            {isPassengerTripFollower ? (
              <Text style={styles.rideSharedTripHint}>{t("ride_trip_following_driver_banner")}</Text>
            ) : null}
            {isDriverOnTripNav ? (
              <Text style={styles.rideSharedTripHint}>{t("ride_trip_driver_leads_banner")}</Text>
            ) : null}
            <Text style={styles.rideOverlayTitle}>{t("ride_trip_participants_title")}</Text>
            <Text style={styles.rideOverlayLine}>
              {t("ride_trip_label_driver")}: {rideContext.driverName}
            </Text>
            {rideContext.driverPhone ? (
              <TouchableOpacity onPress={() => void Linking.openURL(`tel:${rideContext.driverPhone}`)}>
                <Text style={styles.rideOverlayLink}>
                  {t("ride_trip_driver_phone")}: {rideContext.driverPhone}
                </Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.rideOverlayLine}>
              {t("ride_trip_label_passenger")}: {rideContext.passengerName}
            </Text>
            {rideContext.passengerPhone ? (
              <TouchableOpacity onPress={() => void Linking.openURL(`tel:${rideContext.passengerPhone}`)}>
                <Text style={styles.rideOverlayLink}>
                  {t("ride_trip_passenger_phone")}: {rideContext.passengerPhone}
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.rideOverlayBtn}
              onPress={() => setRideDestModalOpen(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="information-circle-outline" size={20} color="#fff" />
              <Text style={styles.rideOverlayBtnText}>{t("ride_trip_destination_details_button")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {mapBearing !== 0 && isActive && (
          <TouchableOpacity
            style={styles.compassButton}
            onPress={() => {
              if (!mapCallbacksAllowed() || !cameraRef.current || !userLocation) return;
              cameraRef.current.setCamera({
                centerCoordinate: [smoothedUserLocation.lon, smoothedUserLocation.lat],
                zoomLevel: 17,
                bearing: 0,
                animationDuration: 300,
              });
              setMapBearing(0);
            }}
            activeOpacity={0.8}
          >
            <View style={styles.compassIconContainer}>
              <View style={[styles.compassIcon, { transform: [{ rotate: `${-mapBearing}deg` }] }]}>
                <View style={styles.compassNeedle}>
                  <View style={styles.compassNeedleRed} />
                  <View style={styles.compassNeedleWhite} />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        )}

        {isActive && userLocation && (
          <TouchableOpacity
            style={styles.recenterButton}
            onPress={() => {
              if (!mapCallbacksAllowed() || !userLocation || !cameraRef.current) return;
              setIsFollowingUser(true);
              cameraRef.current.setCamera({
                centerCoordinate: [smoothedUserLocation.lon, smoothedUserLocation.lat],
                zoomLevel: 17.5,
                bearing: displayHeading ?? currentHeading ?? 0,
                animationDuration: 520,
              });
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="locate" size={20} color={NAV_BLUE} />
            <Text style={styles.recenterButtonText}>{t("recenter") || "Re-centre"}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.floatingButtons}>
          <TouchableOpacity
            style={styles.floatingButton}
            onPress={() => {
              if (routeExitLocked) return;
              if (showFullRoute) {
                withOverlayPause(() => {
                  if (
                    isActive &&
                    userLocation &&
                    mapCallbacksAllowed() &&
                    cameraRef.current
                  ) {
                    setIsFollowingUser(true);
                    if (cameraRef.current) {
                      cameraRef.current.setCamera({
                        centerCoordinate: [userLocation.lon, userLocation.lat],
                        zoomLevel: 17.5,
                        bearing: currentHeading ?? 0,
                        animationDuration: 800,
                      });
                    }
                  }
                  setShowFullRoute(false);
                });
              } else {
                withOverlayPause(() => {
                  showFullRouteOverview();
                });
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons name={showFullRoute ? "locate" : "expand-outline"} size={20} color={DARK_TEAL} />
          </TouchableOpacity>
        </View>

      </View>

      <View style={[styles.routeInfoCard, isPreview && styles.routeInfoCardPreview]}>
        {isActive && !isOnline ? (
          <View style={styles.offlineNavBanner} accessibilityRole="text">
            <Ionicons name="cloud-offline-outline" size={16} color="#92400E" style={{ marginRight: 8 }} />
            <Text style={styles.offlineNavBannerText}>{t("offline_nav_banner")}</Text>
          </View>
        ) : null}
        <NavigationInfoPanel
          accentColor={DARK_TEAL}
          isLive={isActive}
          showLiveDot={isActive}
          liveLabel={t("driving_route") || "Driving Route"}
          rerouting={Boolean(rerouting && isActive)}
          stats={navPanelStats}
          metaLine={navigationMetaLine}
          progress={routeProgress01}
          showProgress={isActive && routeInfo.duration > 0}
          contentPaddingBottom={Platform.OS === "ios" ? 18 : 10}
        >
          {isPreview ? (
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.startNavigationButton}
                onPress={startLiveNavigation}
                disabled={routeExitLocked}
              >
                <Ionicons name="navigate" size={20} color="#FFFFFF" />
                <Text style={styles.startNavigationButtonText}>
                  {t("start_navigation") || "Start Navigation"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backToPlaceButton}
                onPress={returnToMapFromPreview}
                disabled={routeExitLocked}
              >
                <Ionicons name="map-outline" size={20} color={DARK_TEAL} />
                <Text style={styles.backToPlaceButtonText}>{t("return_to_map")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {isActive && !rideContext ? (
            <TouchableOpacity
              style={styles.stopNavigationButton}
              onPress={stopLiveNavigationAndReturnHome}
              disabled={routeExitLocked}
            >
              <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
              <Text style={styles.stopNavigationButtonText}>{t("stop_navigation")}</Text>
            </TouchableOpacity>
          ) : null}
        </NavigationInfoPanel>
      </View>

      <Modal
        visible={showArrivalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowArrivalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.arrivalModalContainer}>
            <View style={styles.arrivalModalContent}>
              <View style={styles.arrivalIconContainer}>
                <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
              </View>
              <Text style={styles.arrivalModalTitle}>
                {t("arrived_at_destination_title") || "You arrived"}
              </Text>
              <Text style={styles.arrivalModalMessage}>
                {destination?.name
                  ? t("arrived_at_destination_named", { name: destination.name })
                  : t("arrived_at_destination_body") || "You have reached your destination."}
              </Text>
              <TouchableOpacity
                style={styles.arrivalModalButton}
                onPress={() => setShowArrivalModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.arrivalModalButtonText}>{t("ok") || "OK"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={rideTripArrivedModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (tripArrivalKind === "driver") {
            onDriverTripArrivedAck();
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.arrivalModalContainer}>
            <View style={styles.arrivalModalContent}>
              <View style={styles.arrivalIconContainer}>
                <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
              </View>
              <Text style={styles.arrivalModalTitle}>
                {tripArrivalKind === "driver"
                  ? t("ride_trip_driver_arrived_title")
                  : t("ride_trip_arrived_title")}
              </Text>
              {tripArrivalKind === "driver" ? (
                <Text style={styles.arrivalModalMessage}>
                  {t("ride_trip_driver_arrived_body")}
                </Text>
              ) : (
                <Text style={styles.arrivalModalMessage}>
                  {t("ride_trip_passenger_end_body")}
                </Text>
              )}
              <TouchableOpacity
                style={styles.arrivalModalButton}
                onPress={() => {
                  if (tripArrivalKind === "driver") {
                    onDriverTripArrivedAck();
                  } else {
                    void onRideTripArrivedConfirm();
                  }
                }}
                disabled={completingRideTrip}
                activeOpacity={0.8}
              >
                <Text style={styles.arrivalModalButtonText}>
                  {completingRideTrip
                    ? "…"
                    : tripArrivalKind === "driver"
                      ? t("ride_trip_driver_arrived_ok")
                      : t("ride_trip_passenger_end_confirm")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={ridePickupArrivedModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          /* auto-dismisses after 5s */
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.arrivalModalContainer}>
            <View style={styles.arrivalModalContent}>
              <View style={styles.arrivalIconContainer}>
                <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
              </View>
              <Text style={styles.arrivalModalTitle}>
                {rideContext?.role === "DRIVER"
                  ? t("ride_pickup_arrived_title")
                  : t("ride_passenger_driver_arrived_title")}
              </Text>
              <Text style={styles.arrivalModalMessage}>
                {rideContext?.role === "DRIVER"
                  ? t("ride_pickup_arrived_body")
                  : t("ride_passenger_driver_arrived_message")}
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {rideContext ? (
        <RideDestinationDetailsModal
          visible={rideDestModalOpen}
          onClose={() => setRideDestModalOpen(false)}
          destinationText={rideContext.destinationText}
          destinationLat={rideContext.destinationLat}
          destinationLon={rideContext.destinationLon}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  header: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: DARK_TEAL,
    textAlign: "center",
    width: "100%",
    letterSpacing: -0.2,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  rideOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.12)",
  },
  rideSharedTripHint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1565c0",
    marginBottom: 8,
    lineHeight: 17,
  },
  rideOverlayTitle: { fontSize: 13, fontWeight: "800", color: DARK_TEAL, marginBottom: 6 },
  rideOverlayLine: { fontSize: 13, color: "#222", marginBottom: 2 },
  rideOverlayLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1565c0",
    marginBottom: 6,
    textDecorationLine: "underline",
  },
  rideOverlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK_TEAL,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  rideOverlayBtnText: { color: "#fff", fontWeight: "700", fontSize: 14, marginLeft: 8 },
  rideHeaderBackBtn: {
    position: "absolute",
    left: 10,
    top: Platform.OS === "ios" ? 46 : (StatusBar.currentHeight ?? 0) + 6,
    padding: 4,
    zIndex: 3,
  },
  userLocationMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
    width: 70,
    height: 70,
  },
  userLocationPulse: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: NAV_BLUE,
  },
  userLocationDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 4,
    borderColor: NAV_BLUE,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: NAV_BLUE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  userLocationInnerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: NAV_BLUE,
  },
  userLocationDirection: {
    position: "absolute",
    top: -12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: NAV_BLUE,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 11,
  },
  startMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  startMarkerPin: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  startMarkerCircle: {
    backgroundColor: "#4CAF50",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 2,
  },
  startMarkerShadow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#4CAF50",
    marginTop: -3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1,
  },
  startMarkerLabel: {
    marginTop: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  startMarkerLabelText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4CAF50",
    letterSpacing: 0.2,
  },
  endMarkerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  endMarkerPin: {
    alignItems: "center",
    justifyContent: "flex-start",
  },
  endMarkerCircle: {
    backgroundColor: "#F44336",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 2,
  },
  endMarkerShadow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#F44336",
    marginTop: -3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1,
  },
  routeInfoCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  offlineNavBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#FCD34D",
  },
  offlineNavBannerText: {
    flex: 1,
    fontSize: 13,
    color: "#92400E",
    lineHeight: 18,
  },
  routeInfoCardPreview: {
    maxHeight: "42%",
  },
  previewActions: {
    marginTop: 4,
    gap: 10,
  },
  startNavigationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: DARK_TEAL,
    paddingVertical: 15,
    borderRadius: 14,
    gap: 8,
  },
  startNavigationButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  backToPlaceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    borderWidth: 2,
    borderColor: "#D8E8EA",
  },
  backToPlaceButtonText: {
    color: DARK_TEAL,
    fontSize: 15,
    fontWeight: "700",
  },
  stopNavigationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F44336",
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  stopNavigationButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  floatingButtons: {
    position: "absolute",
    right: 16,
    top: 130,
    gap: 8,
  },
  floatingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  compassButton: {
    position: "absolute",
    right: 16,
    top: 80,
    zIndex: 1000,
  },
  compassIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  compassIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  compassNeedle: {
    width: 20,
    height: 20,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  compassNeedleRed: {
    position: "absolute",
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#DC2626",
  },
  compassNeedleWhite: {
    position: "absolute",
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#FFFFFF",
  },
  recenterButton: {
    position: "absolute",
    left: 16,
    bottom: 220,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1000,
  },
  recenterButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "600",
    color: NAV_BLUE,
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  arrivalModalContainer: {
    width: "85%",
    maxWidth: 400,
    alignItems: "center",
    justifyContent: "center",
  },
  arrivalModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  arrivalIconContainer: {
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  arrivalModalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 12,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  arrivalModalMessage: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  arrivalModalButton: {
    backgroundColor: DARK_TEAL,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: DARK_TEAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  arrivalModalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
