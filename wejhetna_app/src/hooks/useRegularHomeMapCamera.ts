import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  markerZoomTier,
  zoomForMarkerRender,
} from "../utils/regularHomeMapZoom";

const LOG_PREFIX = "[RegularMapCamera]";

type LatLon = { lat: number; lon: number };

type CameraRef = RefObject<{ setCamera: (opts: object) => void } | null>;

export type CameraMoveMeta = {
  userInitiated: boolean;
  reason: string;
};

/**
 * Regular Home map only: no automatic camera moves. Markers read zoom from a ref;
 * React state updates only when the visibility tier changes (after debounced region idle).
 */
export function useRegularHomeMapCamera({
  cameraRef,
  setMarkerZoom,
}: {
  cameraRef: CameraRef;
  setMarkerZoom: Dispatch<SetStateAction<number>>;
}) {
  const autoCameraBlockedRef = useRef(false);
  const programmaticUntilRef = useRef(0);
  const mapZoomRef = useRef(12.5);
  const lastMarkerTierRef = useRef(-1);
  const regionIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markProgrammaticWindow = useCallback((ms: number) => {
    programmaticUntilRef.current = Date.now() + ms;
  }, []);

  const isProgrammaticWindow = useCallback(() => {
    return Date.now() < programmaticUntilRef.current;
  }, []);

  const requestCameraMove = useCallback(
    (options: Record<string, unknown>, meta: CameraMoveMeta): boolean => {
      if (!cameraRef.current) {
        if (__DEV__) {
          console.log(LOG_PREFIX, "setCamera skipped (no ref)", meta.reason);
        }
        return false;
      }
      if (!meta.userInitiated && autoCameraBlockedRef.current) {
        if (__DEV__) {
          console.log(LOG_PREFIX, "setCamera blocked (auto)", meta.reason, options);
        }
        return false;
      }

      const animMs =
        typeof options.animationDuration === "number"
          ? options.animationDuration
          : 0;
      markProgrammaticWindow(animMs + 400);

      if (__DEV__) {
        console.log(LOG_PREFIX, "setCamera", meta.reason, options);
      }

      try {
        cameraRef.current.setCamera(options);
        return true;
      } catch (e) {
        if (__DEV__) {
          console.log(LOG_PREFIX, "setCamera error", meta.reason, e);
        }
        return false;
      }
    },
    [cameraRef, markProgrammaticWindow]
  );

  const scheduleMarkerZoomSync = useCallback(() => {
    if (regionIdleTimerRef.current) {
      clearTimeout(regionIdleTimerRef.current);
    }
    regionIdleTimerRef.current = setTimeout(() => {
      regionIdleTimerRef.current = null;
      const z = mapZoomRef.current;
      const tier = markerZoomTier(z);
      const next = zoomForMarkerRender(z);
      if (tier !== lastMarkerTierRef.current) {
        lastMarkerTierRef.current = tier;
      }
      setMarkerZoom((prev) => (prev === next ? prev : next));
    }, 450);
  }, [setMarkerZoom]);

  const onRegionWillChange = useCallback(
    (feature: unknown) => {
      if (isProgrammaticWindow()) return;
      const isUser = (feature as { properties?: { isUserInteraction?: boolean } })
        ?.properties?.isUserInteraction;
      if (isUser === true) {
        autoCameraBlockedRef.current = true;
      }
    },
    [isProgrammaticWindow]
  );

  const onRegionDidChange = useCallback(
    (feature: unknown) => {
      if (!isProgrammaticWindow()) {
        const isUser = (feature as { properties?: { isUserInteraction?: boolean } })
          ?.properties?.isUserInteraction;
        if (isUser === true) {
          autoCameraBlockedRef.current = true;
        }
      }

      const newZoom = (feature as { properties?: { zoomLevel?: number } })?.properties
        ?.zoomLevel;
      if (typeof newZoom === "number") {
        mapZoomRef.current = newZoom;
        scheduleMarkerZoomSync();
      }
    },
    [isProgrammaticWindow, scheduleMarkerZoomSync]
  );

  useEffect(() => {
    return () => {
      if (regionIdleTimerRef.current) {
        clearTimeout(regionIdleTimerRef.current);
      }
    };
  }, []);

  const centerOnUserLocation = useCallback(
    (
      userLocation: LatLon,
      opts?: { zoomLevel?: number; animationDuration?: number }
    ) => {
      requestCameraMove(
        {
          centerCoordinate: [userLocation.lon, userLocation.lat],
          zoomLevel: opts?.zoomLevel ?? 15.5,
          animationDuration: opts?.animationDuration ?? 720,
        },
        { userInitiated: true, reason: "locate-me-button" }
      );
    },
    [requestCameraMove]
  );

  return {
    onRegionWillChange,
    onRegionDidChange,
    requestCameraMove,
    centerOnUserLocation,
    mapZoomRef,
    autoCameraBlockedRef,
  };
}
