import { useEffect, useMemo, useRef, useState } from "react";
import { fetchOsrmDrivingRoute } from "../services/navigation/osrmRoute";
import {
  lineStringToFeatureCollection,
  type RouteCoordinatesFeatureCollection,
} from "../types/navigation";
import type { RouteLineStringCoords } from "../types/navigation";
import {
  haversineMeters,
  polylineLengthMeters,
  trimPolylineAheadOfUser,
} from "../utils/routePolyline";
import { zeroNavMetricsIfForced } from "../utils/navMetricsAtArrival";

export type DriverToPickupRouteVisualizationOptions = {
  /** When true, remaining distance and ETA read as 0 (pickup/destination reached). */
  forceZeroMetrics?: boolean;
};

/** Same throttling as RideTrackingMapScreen — OSRM refetch only when needed. */
const OSRM_MIN_INTERVAL_MS = 28_000;
const OSRM_MOVE_THRESHOLD_M = 220;

export type DriverToPickupRouteVisualization = {
  /** Full route polyline (dimmed underlay). */
  routeBackdropFc: RouteCoordinatesFeatureCollection | null;
  /** Remaining path ahead of the driver (updates every time driver position moves). */
  routeRemainingFc: RouteCoordinatesFeatureCollection | null;
  remainingDistanceMeters: number | null;
  /** Interpolated time-to-pickup from remaining fraction of the last OSRM leg (seconds). */
  etaSecondsRemaining: number | null;
  routeLoading: boolean;
  /** Raw OSRM duration for the current leg (seconds), when available. */
  osrmLegDurationSec: number | null;
  /** OSRM leg length (meters) for the last fetched route, when available. */
  osrmLegDistanceM: number | null;
};

/**
 * Shared driver → pickup route model: OSRM (existing service) + trim along polyline (existing utils).
 * Used by RideTrackingMapScreen and RegularRideStatusScreen so both show the same geometry source.
 */
export function useDriverToPickupRouteVisualization(
  driverDot: { lat: number; lon: number } | null,
  pickup: { lat: number; lon: number } | null,
  options?: DriverToPickupRouteVisualizationOptions
): DriverToPickupRouteVisualization {
  const forceZeroMetrics = options?.forceZeroMetrics === true;
  const [routeGeometryCoords, setRouteGeometryCoords] = useState<RouteLineStringCoords | null>(null);
  const [osrmLegDurationSec, setOsrmLegDurationSec] = useState<number | null>(null);
  const [osrmLegDistanceM, setOsrmLegDistanceM] = useState<number | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const lastOsrmAtRef = useRef(0);
  const lastOsrmOriginRef = useRef<{ lat: number; lon: number } | null>(null);
  const hasRouteRef = useRef(false);

  useEffect(() => {
    if (!pickup || !driverDot) {
      hasRouteRef.current = false;
      setRouteGeometryCoords(null);
      setOsrmLegDurationSec(null);
      setOsrmLegDistanceM(null);
      return;
    }

    const from = driverDot;
    const to = pickup;

    if (haversineMeters(from.lat, from.lon, to.lat, to.lon) < 18) {
      hasRouteRef.current = true;
      const short: RouteLineStringCoords = [
        [from.lon, from.lat],
        [to.lon, to.lat],
      ];
      setRouteGeometryCoords(short);
      setOsrmLegDurationSec(0);
      setOsrmLegDistanceM(0);
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
        setOsrmLegDurationSec(osrm.durationSeconds);
        setOsrmLegDistanceM(osrm.distanceMeters);
        setRouteGeometryCoords(osrm.coordinates);
      } catch {
        if (cancelled) return;
        hasRouteRef.current = true;
        const fallback: RouteLineStringCoords = [
          [from.lon, from.lat],
          [to.lon, to.lat],
        ];
        setRouteGeometryCoords(fallback);
        setOsrmLegDurationSec(null);
        setOsrmLegDistanceM(haversineMeters(from.lat, from.lon, to.lat, to.lon));
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickup?.lat, pickup?.lon, driverDot?.lat, driverDot?.lon]);

  const trimmed = useMemo(() => {
    if (!routeGeometryCoords || !driverDot) return null;
    return trimPolylineAheadOfUser(driverDot.lat, driverDot.lon, routeGeometryCoords);
  }, [routeGeometryCoords, driverDot?.lat, driverDot?.lon]);

  const routeBackdropFc = useMemo(() => {
    if (!routeGeometryCoords || routeGeometryCoords.length < 2) return null;
    return lineStringToFeatureCollection(routeGeometryCoords);
  }, [routeGeometryCoords]);

  const routeRemainingFc = useMemo(() => {
    if (!trimmed?.trimmed || trimmed.trimmed.length < 2) return null;
    return lineStringToFeatureCollection(trimmed.trimmed);
  }, [trimmed?.trimmed]);

  const remainingDistanceMeters = useMemo(() => {
    if (trimmed != null) {
      return trimmed.remainingLengthMeters;
    }
    if (osrmLegDistanceM != null) {
      return osrmLegDistanceM;
    }
    return null;
  }, [trimmed, osrmLegDistanceM]);

  const etaSecondsRemaining = useMemo(() => {
    if (osrmLegDurationSec == null || routeGeometryCoords == null) return null;
    const totalM =
      osrmLegDistanceM != null && osrmLegDistanceM > 0
        ? osrmLegDistanceM
        : polylineLengthMeters(routeGeometryCoords);
    if (totalM <= 0) return osrmLegDurationSec;
    const remainM = trimmed?.remainingLengthMeters ?? totalM;
    return Math.max(0, (remainM / totalM) * osrmLegDurationSec);
  }, [osrmLegDurationSec, osrmLegDistanceM, routeGeometryCoords, trimmed?.remainingLengthMeters]);

  const zeroed = zeroNavMetricsIfForced(
    remainingDistanceMeters,
    etaSecondsRemaining,
    forceZeroMetrics
  );

  return {
    routeBackdropFc,
    routeRemainingFc,
    remainingDistanceMeters: zeroed.remainingDistanceMeters,
    etaSecondsRemaining: zeroed.etaSecondsRemaining,
    routeLoading,
    osrmLegDurationSec,
    /** Last OSRM leg length (meters), for UI such as progress along the leg. */
    osrmLegDistanceM,
  };
}
