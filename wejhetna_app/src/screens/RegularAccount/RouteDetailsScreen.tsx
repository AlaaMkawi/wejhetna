// src/screens/RegularAccount/RouteDetailsScreen.tsx

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  Modal,
  Linking,
} from "react-native";
import { emitLiveNavigationExit } from "../../navigation/navigationEvents";
import { useTranslation } from "react-i18next";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/types";
import {
  MapView,
  Camera,
  PointAnnotation,
  ShapeSource,
  LineLayer,
} from "@maplibre/maplibre-react-native";
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
import { RideDestinationDetailsModal } from "../../components/ride/RideDestinationDetailsModal";
import { navigateToUserRideRequestsTab } from "../../utils/rideNavigateToTripScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import {
  completeRideTrip,
  getRegularLatestRideRequest,
  markRideArrived,
  parseStoredUserId,
} from "../../api/rides";

const MAP_STYLE_URL =
  "https://api.maptiler.com/maps/019b0319-f856-79df-b13b-917c4a28f9a8/style.json?key=Js2mV1WY15ayeXH6ceQP";

const DARK_TEAL = "#0f5b63";
const NAV_BLUE = "#4285F4";

const OFF_ROUTE_THRESHOLD_M = 48;
const ON_ROUTE_THRESHOLD_M = 28;
const REROUTE_MIN_INTERVAL_MS = 4500;
const ARRIVAL_RADIUS_M = 55;
const SNAP_TRIM_M = 22;
/** If live start position is this far from the preview-route origin, refetch OSRM from the fresh point. */
const ROUTE_ORIGIN_DRIFT_REFETCH_M = 45;
const MAX_ACCEPTABLE_ACCURACY_M = 30;
const MAX_IMPLIED_SPEED_MPS = 55; // ~198 km/h (reject obvious teleports)
const MAX_JUMP_METERS = 80;
const MAX_JUMP_WINDOW_S = 2.0;
const SNAP_TO_ROUTE_THRESHOLD_M = 15;
const USE_KALMAN_SMOOTHER = true;
const GPS_DEBUG = true;

type RouteDetailsRoute = NativeStackScreenProps<RootStackParamList, "RouteDetails">;

export default function RouteDetailsScreen({ route, navigation }: RouteDetailsRoute) {
  const { t } = useTranslation();
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
  const watchIdRef = useRef<number | null>(null);
  const hasArrivedRef = useRef(false);
  const [showFullRoute, setShowFullRoute] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [currentHeading, setCurrentHeading] = useState<number | null>(null);
  const [mapBearing, setMapBearing] = useState<number>(0);
  const [showArrivalModal, setShowArrivalModal] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [rideDestModalOpen, setRideDestModalOpen] = useState(false);
  // Ride-only arrival modal: replaces the generic "You arrived" popup while a ride is active.
  const [rideTripArrivedModal, setRideTripArrivedModal] = useState(false);
  const [completingRideTrip, setCompletingRideTrip] = useState(false);
  // Pickup-mode arrival: driver reached passenger's pickup — 5 sec auto-dismiss popup + server notify.
  const [ridePickupArrivedModal, setRidePickupArrivedModal] = useState(false);

  const activeRouteCoordsRef = useRef<RouteLineStringCoords>(
    initialCoords.length >= 2 ? [...initialCoords] : [...initialCoords]
  );
  const legDistanceRef = useRef(initialRouteInfo.distance);
  const legDurationRef = useRef(initialRouteInfo.duration);
  const lastRerouteAtRef = useRef(0);
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
    setDisplayRouteFC(lineStringToFeatureCollection(coords));

    setSessionPhase(navigationPhaseParam === "active" ? "active" : "preview");
    hasArrivedRef.current = false;
    setShowArrivalModal(false);
    offRouteSinceRef.current = null;
    headingForSmoothRef.current = null;
    setDisplayHeading(null);
    setCurrentHeading(null);
    lastCameraMoveAtRef.current = 0;
    setIsFollowingUser(false);
    setShowFullRoute(false);
    lastGoodFixRef.current = null;
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

  useEffect(() => {
    isFollowingRef.current = isFollowingUser;
  }, [isFollowingUser]);

  // Removed pulsing animation for navigation marker (custom marker uses lightweight glow)

  const fitCameraToRoute = useCallback(
    (coords: RouteLineStringCoords, padUser: boolean) => {
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
    if (sessionPhase === "preview" && initialCoords.length > 0) {
      const tmr = setTimeout(() => fitCameraToRoute(initialCoords, true), 400);
      return () => clearTimeout(tmr);
    }
  }, [sessionPhase, initialCoords, fitCameraToRoute]);

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
      setDisplayRouteFC(lineStringToFeatureCollection(coords));
    },
    []
  );

  const maybeReroute = useCallback(
    async (lat: number, lon: number) => {
      const dest = destinationRef.current;
      if (!dest) return;
      const now = Date.now();
      if (now - lastRerouteAtRef.current < REROUTE_MIN_INTERVAL_MS) return;
      lastRerouteAtRef.current = now;
      setRerouting(true);
      try {
        const res = await fetchOsrmDrivingRoute({ lat, lon: lon }, dest);
        applyNewRoute(res.coordinates, res.distanceMeters, res.durationSeconds);
        lastProgressAtRef.current = 0;
      } catch (e) {
        console.warn("Reroute failed", e);
      } finally {
        setRerouting(false);
      }
    },
    [applyNewRoute]
  );

  const stopLiveNavigationAndReturnHome = useCallback(() => {
    const w = watchIdRef.current;
    if (w != null) {
      NativeGeolocation.clearWatch(w);
    }
    watchIdRef.current = null;
    isNavigatingRef.current = false;
    isFollowingRef.current = false;
    offRouteSinceRef.current = null;
    headingForSmoothRef.current = null;
    setDisplayHeading(null);
    setCurrentHeading(null);
    hasArrivedRef.current = false;
    setShowArrivalModal(false);
    emitLiveNavigationExit();
    navigation.goBack();
  }, [navigation]);

  const startLiveNavigation = useCallback(() => {
    if (!destination) return;

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
      let fresh = userLocationRef.current ?? initialUserLocation;
      try {
        fresh = await getFreshPositionForNavigationStart();
      } catch {
        /* keep fallback above */
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

      setSessionPhase("active");
      setIsFollowingUser(true);

      setTimeout(() => {
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
          const { latitude, longitude, heading, accuracy, speed } = position.coords;
          const course = (position.coords as { course?: number }).course;
          const ts = typeof position.timestamp === "number" ? position.timestamp : Date.now();
          const acc =
            accuracy != null && !Number.isNaN(accuracy) ? Math.max(0, accuracy) : undefined;
          if (GPS_DEBUG) {
            console.log("[GPS][watch] raw", { latitude, longitude, acc, ts, heading, speed, course });
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

          setUserLocation(newLocation);
          userLocationRef.current = newLocation;

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

          // Reduce re-renders: only update state if display moved enough (~0.5m)
          const prevDisp = displayLocationRef.current;
          if (
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
          }

          // Camera follow (short animation; throttled; based on accepted fixes only)
          const nav = isNavigatingRef.current;
          const follow = isFollowingRef.current;
          if (cameraRef.current && nav && follow) {
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
          distanceFilter: 2,
          interval: 1000,
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

  // Passenger-pickup viewer mode = the passenger is spectating the driver's pickup route.
  // We must NOT engage watchPosition (the passenger's own GPS is irrelevant to this view and
  // would falsely trigger arrival detection), NOR call markRideArrived (driver-only). Instead,
  // we poll the backend for `driver_live_lat/lon` and feed it through the same rendering
  // pipeline (setUserLocation + polyline trim + maybeReroute + camera follow) used by the
  // normal navigation engine.
  const isPassengerPickup =
    rideContext?.mode === "pickup" && rideContext?.role === "REGULAR";

  const startPassengerPickupTracking = useCallback(() => {
    if (!destination) return;
    const wPrev = watchIdRef.current;
    if (wPrev != null) {
      NativeGeolocation.clearWatch(wPrev);
      watchIdRef.current = null;
    }
    setShowFullRoute(false);
    // Passenger never "arrives" on this device; block the arrival path permanently for this view.
    hasArrivedRef.current = true;
    setShowArrivalModal(false);
    setSessionPhase("active");
    setIsFollowingUser(true);
    isNavigatingRef.current = true;
    lastProgressAtRef.current = 0;
    lastCameraMoveAtRef.current = 0;
  }, [destination]);

  const autoStartedLiveNavRef = useRef<boolean>(false);
  useEffect(() => {
    if (autoStartedLiveNavRef.current) return;
    if (sessionPhase !== "active") return;
    if (!rideContext) return;
    autoStartedLiveNavRef.current = true;
    if (isPassengerPickup) {
      startPassengerPickupTracking();
    } else {
      startLiveNavigation();
    }
  }, [
    sessionPhase,
    rideContext,
    isPassengerPickup,
    startLiveNavigation,
    startPassengerPickupTracking,
  ]);

  // Passenger-pickup: poll driver's live location every few seconds and re-use the existing
  // routing pipeline (setUserLocation + trim + reroute + camera) to animate the view.
  useEffect(() => {
    if (!isPassengerPickup) return;
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

          // Reroute if the driver strays substantially from the current polyline.
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

        if (cameraRef.current && isFollowingRef.current) {
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
  }, [isPassengerPickup, destination, rideContext?.rideRequestId, maybeReroute]);

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
      navigateToUserRideRequestsTab(navigation as any, rideContext.role);
    }, 5000);

    return () => {
      cancelled = true;
      clearTimeout(closeTimer);
    };
  }, [ridePickupArrivedModal, rideContext, navigation]);

  const onRideTripArrivedConfirm = useCallback(async () => {
    if (!rideContext || completingRideTrip) return;
    setCompletingRideTrip(true);
    try {
      const stored = await AsyncStorage.getItem("userId");
      const uid = parseStoredUserId(stored);
      if (uid != null) {
        try {
          await completeRideTrip({
            ride_request_id: rideContext.rideRequestId,
            ...(rideContext.role === "DRIVER"
              ? { driver_user_id: uid }
              : { regular_user_id: uid }),
          });
        } catch (err) {
          // Already completed by the other party → accept silently; otherwise warn and keep user on screen.
          const msg = err instanceof Error ? err.message : String(err);
          if (!/already completed/i.test(msg)) {
            Alert.alert(t("error"), t("ride_trip_complete_failed"), [
              { text: t("ok") || "OK" },
            ]);
            setCompletingRideTrip(false);
            return;
          }
        }
      }
      setRideTripArrivedModal(false);
      navigateToUserRideRequestsTab(navigation as any, rideContext.role);
    } finally {
      setCompletingRideTrip(false);
    }
  }, [rideContext, completingRideTrip, navigation, t]);

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

  const etaDate = new Date(Date.now() + remainingSeconds * 1000);

  const onRegionWillChange = (feature: any) => {
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        {rideContext ? (
          <TouchableOpacity
            style={styles.rideHeaderBackBtn}
            onPress={() => navigateToUserRideRequestsTab(navigation as any, rideContext.role)}
            hitSlop={12}
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={26} color={DARK_TEAL} />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.headerTitle}>{headerTitle}</Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView
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

          {userLocation && isPreview && (
            <PointAnnotation id="start_location" coordinate={[userLocation.lon, userLocation.lat]}>
              <View style={styles.startMarkerContainer}>
                <View style={styles.startMarkerPin}>
                  <View style={styles.startMarkerCircle}>
                    <Ionicons name="play" size={16} color="#FFFFFF" />
                  </View>
                  <View style={styles.startMarkerShadow} />
                </View>
                <View style={styles.startMarkerLabel}>
                  <Text style={styles.startMarkerLabelText}>{t("start") || "Start"}</Text>
                </View>
              </View>
            </PointAnnotation>
          )}

          {userLocation && isActive && (
            <NavigationMarker
              id="user_location"
              coordinate={[smoothedUserLocation.lon, smoothedUserLocation.lat]}
              bearingDeg={markerBearing}
            />
          )}

          {destination && (
            <PointAnnotation id="destination" coordinate={[destination.lon, destination.lat]}>
              <View style={styles.endMarkerContainer}>
                <View style={styles.endMarkerPin}>
                  <View style={styles.endMarkerCircle}>
                    <Ionicons name="flag" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.endMarkerShadow} />
                </View>
              </View>
            </PointAnnotation>
          )}

          {displayRouteFC && (
            <ShapeSource id="route" shape={displayRouteFC}>
              {isActive && (
                <LineLayer
                  id="routeLineOutline"
                  style={{
                    lineColor: "#1A73E8",
                    lineWidth: 14,
                    lineCap: "round",
                    lineJoin: "round",
                    lineOpacity: 0.4,
                  } as any}
                />
              )}
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
        </MapView>

        {rideContext ? (
          <View style={styles.rideOverlay}>
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
              if (cameraRef.current && userLocation) {
                cameraRef.current.setCamera({
                  centerCoordinate: [smoothedUserLocation.lon, smoothedUserLocation.lat],
                  zoomLevel: 17,
                  bearing: 0,
                  animationDuration: 300,
                });
                setMapBearing(0);
              }
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
              if (userLocation && cameraRef.current) {
                setIsFollowingUser(true);
                cameraRef.current.setCamera({
                  centerCoordinate: [smoothedUserLocation.lon, smoothedUserLocation.lat],
                  zoomLevel: 17.5,
                  bearing: displayHeading ?? currentHeading ?? 0,
                  animationDuration: 520,
                });
              }
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
              if (showFullRoute) {
                if (isActive && userLocation) {
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
              } else {
                showFullRouteOverview();
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons name={showFullRoute ? "locate" : "expand-outline"} size={20} color={DARK_TEAL} />
          </TouchableOpacity>
        </View>

        {rerouting && isActive && (
          <View style={styles.reroutingPill}>
            <Text style={styles.reroutingText}>{t("rerouting") || "Updating route…"}</Text>
          </View>
        )}
      </View>

      <View style={[styles.routeInfoCard, isPreview && styles.routeInfoCardPreview]}>
        <View style={styles.routeTypeIndicator}>
          <Ionicons name="car" size={20} color={DARK_TEAL} />
          <Text style={styles.routeTypeText}>{t("driving_route") || "Driving Route"}</Text>
        </View>

        <View style={styles.etaRow}>
          <View style={styles.etaBlock}>
            <Text style={styles.etaLabel}>{t("remaining_time") || "Remaining time"}</Text>
            <Text style={styles.etaValue}>
              {t("minutes_remaining_short", {
                minutes: Math.max(1, Math.round(remainingSeconds / 60)),
              })}
            </Text>
          </View>
          <View style={styles.etaDivider} />
          <View style={styles.etaBlock}>
            <Text style={styles.etaLabel}>{t("eta_arrival") || "ETA"}</Text>
            <Text style={styles.etaValue}>{formatEtaClock(etaDate)}</Text>
          </View>
        </View>

        <View style={styles.routeSummary}>
          <View style={styles.routeSummaryItem}>
            <Ionicons name="time-outline" size={18} color={DARK_TEAL} />
            <View style={styles.routeSummaryTextContainer}>
              <Text style={styles.routeSummaryLabel}>{t("time") || "Time"}</Text>
              <Text style={styles.routeSummaryValue}>{formatDuration(routeInfo.duration)}</Text>
            </View>
          </View>
          <View style={styles.routeSummaryDivider} />
          <View style={styles.routeSummaryItem}>
            <Ionicons name="navigate-outline" size={18} color={DARK_TEAL} />
            <View style={styles.routeSummaryTextContainer}>
              <Text style={styles.routeSummaryLabel}>{t("distance") || "Distance"}</Text>
              <Text style={styles.routeSummaryValue}>{formatDistance(routeInfo.distance)}</Text>
            </View>
          </View>
        </View>

        {isPreview && (
          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.startNavigationButton} onPress={startLiveNavigation}>
              <Ionicons name="navigate" size={20} color="#FFFFFF" />
              <Text style={styles.startNavigationButtonText}>
                {t("start_navigation") || "Start Navigation"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backToPlaceButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="map-outline" size={20} color={DARK_TEAL} />
              <Text style={styles.backToPlaceButtonText}>{t("return_to_map")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {isActive && !rideContext && (
          <TouchableOpacity
            style={styles.stopNavigationButton}
            onPress={stopLiveNavigationAndReturnHome}
          >
            <Ionicons name="stop-circle" size={20} color="#FFFFFF" />
            <Text style={styles.stopNavigationButtonText}>{t("stop_navigation")}</Text>
          </TouchableOpacity>
        )}
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
          /* block dismiss – user must tap the confirm button to end the ride */
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.arrivalModalContainer}>
            <View style={styles.arrivalModalContent}>
              <View style={styles.arrivalIconContainer}>
                <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
              </View>
              <Text style={styles.arrivalModalTitle}>
                {t("ride_trip_arrived_title")}
              </Text>
              <TouchableOpacity
                style={styles.arrivalModalButton}
                onPress={() => void onRideTripArrivedConfirm()}
                disabled={completingRideTrip}
                activeOpacity={0.8}
              >
                <Text style={styles.arrivalModalButtonText}>
                  {completingRideTrip ? "…" : t("ride_trip_arrived_confirm")}
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
                {t("ride_pickup_arrived_title")}
              </Text>
              <Text style={styles.arrivalModalMessage}>
                {t("ride_pickup_arrived_body")}
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
    </View>
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
    paddingTop: Platform.OS === "ios" ? 50 : StatusBar.currentHeight ? StatusBar.currentHeight + 4 : 12,
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
  reroutingPill: {
    position: "absolute",
    top: 16,
    alignSelf: "center",
    backgroundColor: "rgba(15,91,99,0.92)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  reroutingText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 32 : 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
    borderTopWidth: 1,
    borderColor: "#E8EDF0",
  },
  routeInfoCardPreview: {
    maxHeight: "42%",
  },
  routeTypeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F9FF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E0F2FE",
  },
  routeTypeText: {
    fontSize: 12,
    fontWeight: "700",
    color: DARK_TEAL,
    marginLeft: 6,
    letterSpacing: 0.3,
  },
  etaRow: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EEF2F6",
  },
  etaBlock: {
    flex: 1,
    alignItems: "center",
  },
  etaDivider: {
    width: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
  },
  etaLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  etaValue: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.3,
  },
  routeSummary: {
    flexDirection: "row",
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  routeSummaryItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  routeSummaryTextContainer: {
    marginLeft: 8,
  },
  routeSummaryLabel: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  routeSummaryValue: {
    fontSize: 16,
    fontWeight: "700",
    color: DARK_TEAL,
    letterSpacing: -0.2,
  },
  routeSummaryDivider: {
    width: 1,
    height: 35,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 12,
  },
  previewActions: {
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
