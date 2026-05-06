import React, { useMemo } from "react";
import { ShapeSource, LineLayer } from "@maplibre/maplibre-react-native";
import { haversineMeters } from "../../utils/routePolyline";
import { lineStringToFeatureCollection } from "../../types/navigation";

/**
 * Dotted "leader line" from the current user/driver location to the first
 * point of the actual road route — only rendered when the user is visibly
 * **off** the road (further than `minDistanceMeters`).
 *
 * Inspired by the standard turn-by-turn pattern (e.g. Google/Waze): a thin
 * dashed connector that quietly says "you are here, the road starts there"
 * without competing with the main route line.
 *
 * Behavior:
 *  - If either coord is missing or the two points are closer than the
 *    threshold, nothing is rendered (avoids jitter when standing on the road).
 *  - Pure presentation — no routing logic, no API calls.
 */
export type OffRoutePathConnectorProps = {
  /** Stable id used by MapLibre for the underlying ShapeSource/LineLayer. */
  id: string;
  /** Where the user / driver currently is. */
  from: { lat: number; lon: number } | null | undefined;
  /** First coordinate of the actual road route, as `[lon, lat]`. */
  to: [number, number] | null | undefined;
  /** Minimum gap (m) before the connector appears. Default ~12m. */
  minDistanceMeters?: number;
  /** Visible color — defaults to the brand teal. */
  color?: string;
  /** Stroke width in px. */
  width?: number;
  /** Optional MapLibre `aboveLayerID` for fine layering control. */
  aboveLayerID?: string;
};

export function OffRoutePathConnector({
  id,
  from,
  to,
  minDistanceMeters = 12,
  color = "#0f5b63",
  width = 3,
  aboveLayerID,
}: OffRoutePathConnectorProps) {
  const fc = useMemo(() => {
    if (!from || !to) return null;
    const distM = haversineMeters(from.lat, from.lon, to[1], to[0]);
    if (!Number.isFinite(distM) || distM < minDistanceMeters) return null;
    return lineStringToFeatureCollection([
      [from.lon, from.lat],
      [to[0], to[1]],
    ]);
  }, [
    from?.lat,
    from?.lon,
    to?.[0],
    to?.[1],
    minDistanceMeters,
  ]);

  if (!fc) return null;
  return (
    <ShapeSource id={`${id}_src`} shape={fc}>
      <LineLayer
        id={`${id}_line`}
        aboveLayerID={aboveLayerID}
        style={
          {
            lineColor: color,
            lineWidth: width,
            lineOpacity: 0.85,
            lineCap: "round",
            lineJoin: "round",
            // Tight dashes for a clear "dotted" feeling. Values are in line widths.
            lineDasharray: [0.6, 1.6],
          } as object
        }
      />
    </ShapeSource>
  );
}

export default OffRoutePathConnector;
