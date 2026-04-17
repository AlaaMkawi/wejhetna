import { Platform, PermissionsAndroid } from "react-native";
import { NativeGeolocation } from "./nativeGeolocation";
import i18n from "../i18n";
import { getAndroidLocationStatus } from "./androidLocationStatus";

export type LatLon = { lat: number; lon: number };
const GPS_DEBUG = true;

function errSummary(e: unknown): { code?: number; message: string } {
  const x = e as { code?: number; message?: string } | undefined;
  return { code: x?.code, message: String(x?.message || e || "") };
}

function isNoProviderAvailableError(e: unknown): boolean {
  const s = errSummary(e);
  const m = s.message.toLowerCase();
  return m.includes("no location provider") || m.includes("provider available") || m.includes("provider");
}

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
      NativeGeolocation.requestAuthorization((status: unknown) => {
        // 'granted' / 'denied' / 'disabled' are common
        resolve(String(status) === "granted");
      });
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
    if (GPS_DEBUG) {
      console.log("[GPS][perm] ensureForegroundLocationForNavigation android: checking FINE");
    }
    if (await isForegroundLocationGranted()) {
      if (GPS_DEBUG) console.log("[GPS][perm] already granted");
      return true;
    }
    const granted = await requestForegroundLocationPermission();
    if (!granted) {
      if (GPS_DEBUG) console.log("[GPS][perm] request denied");
      return false;
    }
    const ok = await isForegroundLocationGranted();
    if (GPS_DEBUG) console.log("[GPS][perm] granted after request?", ok);
    return ok;
  }
  if (GPS_DEBUG) console.log("[GPS][perm] ensureForegroundLocationForNavigation ios: requestAuthorization");
  return requestForegroundLocationPermission();
}

/** One attempt with given options */
function getCurrentPositionOnce(options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<LatLon> {
  return new Promise((resolve, reject) => {
    if (Platform.OS === "android") {
      // Preflight provider check to avoid fatal native crashes on some devices/ROMs when no providers exist.
      getAndroidLocationStatus()
        .then((st) => {
          if (GPS_DEBUG && st) console.log("[GPS][androidStatus]", st);
          if (st && (!st.locationEnabled || (!st.gpsEnabled && !st.networkEnabled))) {
            reject({ code: 2, message: "Location services are disabled (no provider enabled)." });
            return;
          }
          if (st && !st.playServicesAvailable && GPS_DEBUG) {
            console.log("[GPS][androidStatus] Google Play Services unavailable", st.playServicesStatus);
          }
          if (GPS_DEBUG) {
            console.log("[GPS][getCurrentPosition] request", options);
          }
          NativeGeolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              if (GPS_DEBUG) {
                console.log("[GPS][getCurrentPosition] success", {
                  lat: latitude,
                  lon: longitude,
                  acc: position.coords.accuracy,
                  ts: position.timestamp,
                });
              }
              resolve({ lat: latitude, lon: longitude });
            },
            (error) => {
              if (GPS_DEBUG) {
                console.log("[GPS][getCurrentPosition] error", errSummary(error));
              }
              reject(error);
            },
            options
          );
        })
        .catch((e) => {
          if (GPS_DEBUG) console.log("[GPS][androidStatus] failed", errSummary(e));
          // If status check fails, still attempt GPS call (don’t block).
          if (GPS_DEBUG) {
            console.log("[GPS][getCurrentPosition] request", options);
          }
          NativeGeolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              if (GPS_DEBUG) {
                console.log("[GPS][getCurrentPosition] success", {
                  lat: latitude,
                  lon: longitude,
                  acc: position.coords.accuracy,
                  ts: position.timestamp,
                });
              }
              resolve({ lat: latitude, lon: longitude });
            },
            (error) => {
              if (GPS_DEBUG) {
                console.log("[GPS][getCurrentPosition] error", errSummary(error));
              }
              reject(error);
            },
            options
          );
        });
      return;
    }

    if (GPS_DEBUG) {
      console.log("[GPS][getCurrentPosition] request", options);
    }
    NativeGeolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (GPS_DEBUG) {
          console.log("[GPS][getCurrentPosition] success", {
            lat: latitude,
            lon: longitude,
            acc: position.coords.accuracy,
            ts: position.timestamp,
          });
        }
        resolve({ lat: latitude, lon: longitude });
      },
      (error) => {
        if (GPS_DEBUG) {
          console.log("[GPS][getCurrentPosition] error", errSummary(error));
        }
        reject(error);
      },
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
  // For route building / navigation preview: prefer a **fresh** fix.
  // Cached/last-known locations are a common cause of “off-road for 5–30s then correct”.
  const tiers = [
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  ];
  let lastError: unknown;
  for (const opts of tiers) {
    try {
      return await getCurrentPositionOnce(opts);
    } catch (e: any) {
      lastError = e;
      if (e?.code === 1) throw e; // permission denied
    }
  }
  // If GPS provider is unavailable (common on some devices when high accuracy is forced),
  // fall back to network provider WITHOUT allowing cached fixes.
  if (isNoProviderAvailableError(lastError)) {
    const fallback = { enableHighAccuracy: false, timeout: 20000, maximumAge: 0 };
    if (GPS_DEBUG) {
      console.log("[GPS][routeOrigin] highAccuracy provider unavailable; fallback to network", fallback);
    }
    return await getCurrentPositionOnce(fallback);
  }
  throw lastError;
}

/**
 * Fresh fix for starting live navigation (avoid stale route origin). Short maxAge first, then tight.
 */
export async function getFreshPositionForNavigationStart(): Promise<LatLon> {
  // Starting live navigation must not rely on cached points.
  const tiers = [
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
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
  if (isNoProviderAvailableError(lastError)) {
    const fallback = { enableHighAccuracy: false, timeout: 20000, maximumAge: 0 };
    if (GPS_DEBUG) {
      console.log("[GPS][navStart] highAccuracy provider unavailable; fallback to network", fallback);
    }
    return await getCurrentPositionOnce(fallback);
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

/**
 * Driver / ride flows: current fix with the same multi-attempt strategy as {@link getCurrentPositionReliable},
 * returned in Geolocation-like shape (`coords.latitude` / `coords.longitude`).
 */
export async function requestCurrentPositionWithRetry(): Promise<{
  coords: { latitude: number; longitude: number };
}> {
  const pos = await getCurrentPositionReliable();
  return {
    coords: { latitude: pos.lat, longitude: pos.lon },
  };
}
