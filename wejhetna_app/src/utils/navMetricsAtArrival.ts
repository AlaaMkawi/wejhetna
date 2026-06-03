import { normalizeRideRequestStatus } from "../api/rides";
import { NAV_DEST_ARRIVAL_RADIUS_M } from "./homeNavigationExit";

export type NavMetricsAtArrivalOptions = {
  /** Server or local UI considers the current leg complete — show 0 distance/time. */
  atArrival?: boolean;
};

/** Ride is at passenger pickup (driver marked arrived / OTP phase). */
export function isPickupArrivalStatus(status: string | undefined | null): boolean {
  return normalizeRideRequestStatus(status) === "arrived";
}

export function zeroNavMetricsIfForced(
  remainingDistanceMeters: number | null,
  etaSecondsRemaining: number | null,
  forceZero: boolean
): { remainingDistanceMeters: number | null; etaSecondsRemaining: number | null } {
  if (!forceZero) {
    return { remainingDistanceMeters, etaSecondsRemaining };
  }
  return { remainingDistanceMeters: 0, etaSecondsRemaining: 0 };
}

export function isNavMetricsLocked(options?: NavMetricsAtArrivalOptions): boolean {
  return options?.atArrival === true;
}

/** Meters for logic; null when unknown and not locked. */
export function navRemainingMeters(
  remainingDistanceMeters: number | null | undefined,
  options?: NavMetricsAtArrivalOptions
): number | null {
  if (isNavMetricsLocked(options)) return 0;
  if (remainingDistanceMeters == null || !Number.isFinite(remainingDistanceMeters)) return null;
  return Math.max(0, remainingDistanceMeters);
}

/** Seconds for logic; null when unknown and not locked. */
export function navRemainingSeconds(
  etaSecondsRemaining: number | null | undefined,
  options?: NavMetricsAtArrivalOptions
): number | null {
  if (isNavMetricsLocked(options)) return 0;
  if (etaSecondsRemaining == null || !Number.isFinite(etaSecondsRemaining)) return null;
  return Math.max(0, etaSecondsRemaining);
}

/** User-facing distance string (RouteDetails-style). */
export function formatNavRemainingDistanceMeters(
  meters: number,
  options?: NavMetricsAtArrivalOptions
): string {
  if (isNavMetricsLocked(options) || meters <= 0) {
    return "0 m";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Whole minutes for list / phase copy; returns 0 at arrival or when ETA seconds are 0. */
export function navEtaMinutesFromSeconds(
  etaSecondsRemaining: number | null | undefined,
  options?: NavMetricsAtArrivalOptions
): number | null {
  const sec = navRemainingSeconds(etaSecondsRemaining, options);
  if (sec == null) return null;
  if (sec <= 0) return 0;
  if (sec <= 90) return 1;
  return Math.max(1, Math.round(sec / 60));
}

/** Sub-minute ETA chip; allows 0 when at arrival or natural end of leg. */
export function navEtaSecondsForDisplay(
  etaSecondsRemaining: number | null | undefined,
  options?: NavMetricsAtArrivalOptions
): number | null {
  const sec = navRemainingSeconds(etaSecondsRemaining, options);
  if (sec == null) return null;
  return Math.round(sec);
}

/** Kilometers (one decimal) for ride distance lines. */
export function navDistanceKmFromMeters(
  remainingDistanceMeters: number | null | undefined,
  options?: NavMetricsAtArrivalOptions
): number | null {
  const m = navRemainingMeters(remainingDistanceMeters, options);
  if (m == null) return null;
  return Math.round((m / 1000) * 10) / 10;
}

/** Minutes for RouteDetails-style panels; never floors sub-minute remaining to 1 when already at destination. */
export function navRemainingMinutesFromSeconds(
  seconds: number,
  options?: NavMetricsAtArrivalOptions
): number {
  if (isNavMetricsLocked(options) || seconds <= 0) return 0;
  return Math.max(1, Math.round(seconds / 60));
}

/** Lock display when within destination radius (matches RouteDetails arrival detection). */
export function shouldLockNavMetricsForProximity(
  remainingRouteMeters: number,
  distanceToDestinationMeters: number | null | undefined
): boolean {
  if (remainingRouteMeters <= NAV_DEST_ARRIVAL_RADIUS_M) return true;
  if (
    distanceToDestinationMeters != null &&
    Number.isFinite(distanceToDestinationMeters) &&
    distanceToDestinationMeters <= NAV_DEST_ARRIVAL_RADIUS_M
  ) {
    return true;
  }
  return false;
}
