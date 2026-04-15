import { Platform, PermissionsAndroid } from "react-native";
import Geolocation from "@react-native-community/geolocation";
import i18n from "../i18n";

export type LatLon = { lat: number; lon: number };

/**
 * Android only. On iOS, use requestForegroundLocationPermission — do not probe with getCurrentPosition
 * (extra reads cause timeouts, battery use, and duplicate failures with the map screen).
 */
export async function isForegroundLocationGranted(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return true;
  }
  try {
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
  } catch {
    return false;
  }
}

/**
 * Shows the system permission dialog when needed (Android + iOS authorization).
 */
export async function requestForegroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: i18n.t("location_permission_rationale_title"),
          message: i18n.t("location_permission_rationale_message"),
          buttonPositive: i18n.t("ok") || "OK",
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  return await new Promise((resolve) => {
    try {
      Geolocation.requestAuthorization(
        () => resolve(true),
        () => resolve(false)
      );
    } catch {
      resolve(false);
    }
  });
}

/**
 * For navigation / route: Android checks runtime permission; iOS uses authorization only
 * (no location read — avoids false timeouts before GPS has a fix).
 */
export async function ensureForegroundLocationForNavigation(): Promise<boolean> {
  if (Platform.OS === "android") {
    if (await isForegroundLocationGranted()) {
      return true;
    }
    const granted = await requestForegroundLocationPermission();
    if (!granted) {
      return false;
    }
    return isForegroundLocationGranted();
  }
  return requestForegroundLocationPermission();
}

/** One attempt with given options */
function getCurrentPositionOnce(options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve({ lat: latitude, lon: longitude });
      },
      (error) => reject(error),
      options
    );
  });
}

/**
 * Stable location for map bootstrap: last-known / network first, then GPS.
 * Stops retrying on PERMISSION_DENIED (code 1).
 */
export async function getCurrentPositionReliable(): Promise<LatLon> {
  const attempts: Array<{
    enableHighAccuracy: boolean;
    timeout: number;
    maximumAge: number;
  }> = [
    {
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 600000,
    },
    {
      enableHighAccuracy: false,
      timeout: 25000,
      maximumAge: 120000,
    },
    {
      enableHighAccuracy: true,
      timeout: 45000,
      maximumAge: 0,
    },
  ];

  let lastError: unknown;
  for (const opts of attempts) {
    try {
      return await getCurrentPositionOnce(opts);
    } catch (e: any) {
      lastError = e;
      if (e?.code === 1) {
        throw e;
      }
    }
  }
  throw lastError;
}

/**
 * Origin for OSRM / new route: prefer a **fast** fix (recent cache or network), then fall back
 * to the same tiers as getCurrentPositionReliable. Avoids long wait before the route line appears.
 */
export async function getNavigationRouteOrigin(): Promise<LatLon> {
  const fastTiers = [
    { enableHighAccuracy: false, timeout: 4000, maximumAge: 20000 },
    { enableHighAccuracy: false, timeout: 5500, maximumAge: 120000 },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
  ];

  let lastError: unknown;
  for (const opts of fastTiers) {
    try {
      return await getCurrentPositionOnce(opts);
    } catch (e: any) {
      lastError = e;
      if (e?.code === 1) {
        throw e;
      }
    }
  }

  for (const opts of [
    { enableHighAccuracy: false, timeout: 22000, maximumAge: 120000 },
    { enableHighAccuracy: true, timeout: 40000, maximumAge: 0 },
  ]) {
    try {
      return await getCurrentPositionOnce(opts);
    } catch (e: any) {
      lastError = e;
      if (e?.code === 1) {
        throw e;
      }
    }
  }
  throw lastError;
}

/**
 * Fresh fix for starting live navigation (avoid stale route origin). Short maxAge first, then tight.
 */
export async function getFreshPositionForNavigationStart(): Promise<LatLon> {
  const tiers = [
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 8000 },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 25000 },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  ];
  let lastError: unknown;
  for (const opts of tiers) {
    try {
      return await getCurrentPositionOnce(opts);
    } catch (e: any) {
      lastError = e;
      if (e?.code === 1) {
        throw e;
      }
    }
  }
  throw lastError;
}

/** Route preview from map — fast origin, then accurate fallback. */
export function getCurrentPositionForRoute(): Promise<LatLon> {
  return getNavigationRouteOrigin();
}

export function isLocationTimeoutOrUnavailableError(error: unknown): boolean {
  const e = error as { code?: number; message?: string } | undefined;
  const c = e?.code;
  const m = String(e?.message || "").toLowerCase();
  return (
    c === 2 ||
    c === 3 ||
    m.includes("timed out") ||
    m.includes("timeout") ||
    m.includes("location request timed out")
  );
}
