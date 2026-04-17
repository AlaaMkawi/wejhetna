import { useEffect, useRef, useState } from "react";
import { bearingDegrees } from "../../utils/geoBearing";
import { haversineMeters } from "../../utils/routePolyline";

/**
 * Computes a stable “course up” heading from successive driver positions (e.g. API or GPS),
 * so the car icon can rotate without requiring magnetometer heading.
 */
export function useDriverTrailHeading(
  lat: number | null | undefined,
  lon: number | null | undefined,
  minMoveMeters = 5
): number | null {
  const prevRef = useRef<{ lat: number; lon: number } | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);

  useEffect(() => {
    if (
      lat == null ||
      lon == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      prevRef.current = null;
      setHeadingDeg(null);
      return;
    }
    const cur = { lat, lon };
    const prev = prevRef.current;
    if (prev) {
      const d = haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon);
      if (d >= minMoveMeters) {
        setHeadingDeg(bearingDegrees(prev.lat, prev.lon, cur.lat, cur.lon));
      }
    }
    prevRef.current = cur;
  }, [lat, lon, minMoveMeters]);

  return headingDeg;
}
