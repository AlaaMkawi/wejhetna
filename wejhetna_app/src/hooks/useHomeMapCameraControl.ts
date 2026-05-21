import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { quantizeZoomForMarkers } from "../components/map/markerScale";

type LatLon = { lat: number; lon: number };

type CameraRef = RefObject<{ setCamera: (opts: object) => void } | null>;

export type UseHomeMapCameraControlOptions = {
  cameraRef: CameraRef;
  userLocation: LatLon | null;
  setCurrentZoom: Dispatch<SetStateAction<number>>;
  /** Zoom for the one-time initial center on first GPS fix. */
  initialCenterZoom?: number;
  /** When true, center once when the user enters map pick-destination mode. */
  isPickingMapDestination?: boolean;
  pickModeZoom?: number;
};

/**
 * Home tab maps: track zoom from region changes, one-time center on first GPS,
 * and stop auto-recenter after the user pans/zooms manually.
 */
export function useHomeMapCameraControl({
  cameraRef,
  userLocation,
  setCurrentZoom,
  initialCenterZoom = 14,
  isPickingMapDestination = false,
  pickModeZoom = 15.25,
}: UseHomeMapCameraControlOptions) {
  const userHasMovedMapRef = useRef(false);
  const didInitialCenterRef = useRef(false);
  const pickModeCameraDoneRef = useRef(false);

  const centerOnUserLocation = useCallback(
    (opts?: { zoomLevel?: number; animationDuration?: number }) => {
      if (!userLocation || !cameraRef.current) return;
      try {
        cameraRef.current.setCamera({
          centerCoordinate: [userLocation.lon, userLocation.lat],
          zoomLevel: opts?.zoomLevel ?? initialCenterZoom,
          animationDuration: opts?.animationDuration ?? 720,
        });
      } catch {
        /* ignore */
      }
    },
    [cameraRef, userLocation, initialCenterZoom]
  );

  const onRegionWillChange = useCallback((feature: unknown) => {
    const props = (feature as { properties?: { isUserInteraction?: boolean } })
      ?.properties;
    if (props?.isUserInteraction === true) {
      userHasMovedMapRef.current = true;
    }
  }, []);

  const onRegionDidChange = useCallback(
    (feature: unknown) => {
      const newZoom = (feature as { properties?: { zoomLevel?: number } })
        ?.properties?.zoomLevel;
      if (typeof newZoom === "number") {
        const next = quantizeZoomForMarkers(newZoom);
        setCurrentZoom((prev) => (prev === next ? prev : next));
      }
    },
    [setCurrentZoom]
  );

  /** First GPS fix: center once if the user has not moved the map yet. */
  useEffect(() => {
    if (!userLocation || userHasMovedMapRef.current || didInitialCenterRef.current) {
      return;
    }
    didInitialCenterRef.current = true;
    centerOnUserLocation({ zoomLevel: initialCenterZoom, animationDuration: 600 });
  }, [userLocation, centerOnUserLocation, initialCenterZoom]);

  /** Pick-destination mode: center once on enter, not on every GPS refresh. */
  useEffect(() => {
    if (!isPickingMapDestination) {
      pickModeCameraDoneRef.current = false;
      return;
    }
    if (
      pickModeCameraDoneRef.current ||
      userLocation == null ||
      !cameraRef.current
    ) {
      return;
    }
    pickModeCameraDoneRef.current = true;
    const timer = setTimeout(() => {
      centerOnUserLocation({ zoomLevel: pickModeZoom, animationDuration: 720 });
    }, 100);
    return () => clearTimeout(timer);
  }, [isPickingMapDestination, userLocation, cameraRef, centerOnUserLocation, pickModeZoom]);

  return {
    onRegionWillChange,
    onRegionDidChange,
    centerOnUserLocation,
    userHasMovedMapRef,
  };
}
