import React, { memo } from "react";
import { Camera } from "@maplibre/maplibre-react-native";

const INITIAL_CENTER: [number, number] = [34.83, 31.24];
const INITIAL_ZOOM = 12.5;

const NEGEV_BOUNDS = {
  ne: [35.1, 31.42] as [number, number],
  sw: [34.72, 31.18] as [number, number],
};

type Props = {
  cameraRef: React.RefObject<{ setCamera: (opts: object) => void } | null>;
};

/**
 * Stable Camera child so marker/zoom state updates on the parent screen do not
 * re-apply `defaultSettings` and snap the map back to INITIAL_CENTER.
 */
function RegularHomeMapCameraInner({ cameraRef }: Props) {
  return (
    <Camera
      ref={cameraRef}
      defaultSettings={{
        centerCoordinate: INITIAL_CENTER,
        zoomLevel: INITIAL_ZOOM,
      }}
      maxBounds={NEGEV_BOUNDS}
      minZoomLevel={10}
      maxZoomLevel={18}
    />
  );
}

export const RegularHomeMapCamera = memo(RegularHomeMapCameraInner);
