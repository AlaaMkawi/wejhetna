import { NativeEventEmitter, NativeModules, Platform } from "react-native";
import GeolocationIOS from "react-native-geolocation-service";

type GeoPosition = {
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    course?: number;
  };
  timestamp?: number;
};

type GeoError = { code?: number; message?: string };

type WatchOptions = {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  distanceFilter?: number;
  interval?: number;
};

const DEBUG = true;

const { FusedLocation } = NativeModules as {
  FusedLocation?: {
    getCurrentPosition: (options: Partial<WatchOptions>) => Promise<GeoPosition>;
    watchPosition: (options: Partial<WatchOptions>) => Promise<number>;
    clearWatch: (watchId: number) => void;
  };
};

const emitter = new NativeEventEmitter(Platform.OS === "android" ? (FusedLocation as any) : undefined);

export const NativeGeolocation = {
  requestAuthorization: (...args: any[]) => {
    // iOS-only; keep compatibility
    // @ts-expect-error
    return GeolocationIOS.requestAuthorization?.(...args);
  },

  getCurrentPosition: (
    success: (p: GeoPosition) => void,
    error: (e: GeoError) => void,
    options: Partial<WatchOptions>
  ) => {
    if (DEBUG) console.log("[GPS][NativeGeo] getCurrentPosition before", options);

    if (Platform.OS === "android") {
      if (!FusedLocation?.getCurrentPosition) {
        error({ code: 2, message: "FusedLocation native module missing" });
        return;
      }
      FusedLocation.getCurrentPosition(options)
        .then((p) => {
          if (DEBUG) console.log("[GPS][NativeGeo] getCurrentPosition success", p?.coords);
          success(p);
        })
        .catch((e: any) => {
          if (DEBUG) console.log("[GPS][NativeGeo] getCurrentPosition error", e);
          error({ code: e?.code, message: e?.message || String(e) });
        });
      return;
    }

    GeolocationIOS.getCurrentPosition(
      (p) => {
        if (DEBUG) console.log("[GPS][NativeGeo] getCurrentPosition success(iOS)", p?.coords);
        success(p as any);
      },
      (e) => {
        if (DEBUG) console.log("[GPS][NativeGeo] getCurrentPosition error(iOS)", e);
        error(e as any);
      },
      options as any
    );
  },

  watchPosition: (
    success: (p: GeoPosition) => void,
    error: (e: GeoError) => void,
    options: Partial<WatchOptions>
  ): number => {
    if (DEBUG) console.log("[GPS][NativeGeo] watchPosition before", options);

    if (Platform.OS === "android") {
      if (!FusedLocation?.watchPosition) {
        error({ code: 2, message: "FusedLocation native module missing" });
        return -1;
      }
      let watchId = -1;
      // Subscribe first (so we don't miss the first event)
      const sub = emitter.addListener("FusedLocationUpdate", (payload: any) => {
        if (payload?.watchId !== watchId) return;
        const p: GeoPosition = { coords: payload.coords, timestamp: payload.timestamp };
        success(p);
      });

      FusedLocation.watchPosition(options)
        .then((id) => {
          watchId = id;
          if (DEBUG) console.log("[GPS][NativeGeo] watchPosition started", watchId);
        })
        .catch((e: any) => {
          if (DEBUG) console.log("[GPS][NativeGeo] watchPosition error", e);
          sub.remove();
          error({ code: e?.code, message: e?.message || String(e) });
        });

      // Return a provisional id (real id will be set async); caller clears via clearWatch anyway.
      // We'll store listener keyed by real watchId in clearWatch.
      (listenerMap as any).__pending?.push({ sub, getId: () => watchId });
      return watchId;
    }

    const id = GeolocationIOS.watchPosition(success as any, error as any, options as any) as any;
    return typeof id === "number" ? id : -1;
  },

  clearWatch: (watchId: number) => {
    if (DEBUG) console.log("[GPS][NativeGeo] clearWatch", watchId);
    if (Platform.OS === "android") {
      try {
        // remove native updates
        FusedLocation?.clearWatch?.(watchId);
      } catch {}
      // remove JS listener(s)
      const sub = listenerMap.get(watchId);
      if (sub) {
        sub.remove();
        listenerMap.delete(watchId);
      }
      // also clean pending
      const pending = (listenerMap as any).__pending as Array<{ sub: any; getId: () => number }> | undefined;
      if (pending) {
        (listenerMap as any).__pending = pending.filter((p) => {
          const id = p.getId();
          if (id === watchId) {
            p.sub.remove();
            return false;
          }
          return true;
        });
      }
      return;
    }

    GeolocationIOS.clearWatch(watchId);
  },
};

const listenerMap = new Map<number, { remove: () => void }>();
(listenerMap as any).__pending = [] as Array<{ sub: any; getId: () => number }>;

// Periodically bind pending listeners to real watch ids once assigned.
setInterval(() => {
  if (Platform.OS !== "android") return;
  const pending = (listenerMap as any).__pending as Array<{ sub: any; getId: () => number }>;
  if (!pending?.length) return;
  const keep: typeof pending = [];
  for (const p of pending) {
    const id = p.getId();
    if (id > 0 && !listenerMap.has(id)) {
      listenerMap.set(id, p.sub);
    } else if (id <= 0) {
      keep.push(p);
    }
  }
  (listenerMap as any).__pending = keep;
}, 250);

