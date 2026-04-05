import type { RouteLineStringCoords } from "../types/navigation";

const EARTH_M = 6371000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const r1 = (lat1 * Math.PI) / 180;
  const r2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(r1) * Math.cos(r2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_M * c;
}

/** Short-range planar distance from point P to segment A–B (meters). Good enough for Negev-scale polylines. */
function distancePointToSegmentMeters(
  lat: number,
  lon: number,
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const refLat = (lat1 + lat2 + lat) / 3;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((refLat * Math.PI) / 180);

  const ax = 0;
  const ay = 0;
  const bx = (lon2 - lon1) * mPerDegLon;
  const by = (lat2 - lat1) * mPerDegLat;
  const px = (lon - lon1) * mPerDegLon;
  const py = (lat - lat1) * mPerDegLat;

  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 < 1e-6 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  return Math.hypot(px - qx, py - qy);
}

export function minDistanceToPolylineMeters(
  lat: number,
  lon: number,
  coords: RouteLineStringCoords
): number {
  if (coords.length < 2) {
    if (coords.length === 1) {
      return haversineMeters(lat, lon, coords[0][1], coords[0][0]);
    }
    return Infinity;
  }
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const d = distancePointToSegmentMeters(lat, lon, lat1, lon1, lat2, lon2);
    if (d < min) min = d;
  }
  return min;
}

export type SnapResult = {
  trimmed: RouteLineStringCoords;
  /** Meters remaining along trimmed path (sum of segment lengths). */
  remainingLengthMeters: number;
};

/**
 * Drops vertices already passed and starts the line at the closest point on the route ahead of the user.
 */
export function trimPolylineAheadOfUser(
  lat: number,
  lon: number,
  coords: RouteLineStringCoords,
  snapThresholdMeters = 18
): SnapResult {
  if (coords.length < 2) {
    return { trimmed: coords, remainingLengthMeters: 0 };
  }

  let bestDist = Infinity;
  let bestSeg = 0;
  let bestT = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const refLat = (lat1 + lat2 + lat) / 3;
    const mPerDegLat = 111320;
    const mPerDegLon = 111320 * Math.cos((refLat * Math.PI) / 180);
    const ax = 0;
    const ay = 0;
    const bx = (lon2 - lon1) * mPerDegLon;
    const by = (lat2 - lat1) * mPerDegLat;
    const px = (lon - lon1) * mPerDegLon;
    const py = (lat - lat1) * mPerDegLat;
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 < 1e-6 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const qx = ax + t * abx;
    const qy = ay + t * aby;
    const d = Math.hypot(px - qx, py - qy);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i;
      bestT = t;
    }
  }

  const [lonA, latA] = coords[bestSeg];
  const [lonB, latB] = coords[bestSeg + 1];
  const snapLon = lonA + bestT * (lonB - lonA);
  const snapLat = latA + bestT * (latB - latA);

  let trimmed: RouteLineStringCoords;
  if (bestDist <= snapThresholdMeters) {
    const tail = coords.slice(bestSeg + 1);
    trimmed = [[snapLon, snapLat], ...tail];
    if (trimmed.length >= 2) {
      const [l0, l1] = [trimmed[0], trimmed[1]];
      if (haversineMeters(snapLat, snapLon, l1[1], l1[0]) < 4) {
        trimmed = trimmed.slice(1);
      }
    }
  } else {
    trimmed = [...coords];
  }

  let remainingLengthMeters = 0;
  for (let i = 0; i < trimmed.length - 1; i++) {
    remainingLengthMeters += haversineMeters(
      trimmed[i][1],
      trimmed[i][0],
      trimmed[i + 1][1],
      trimmed[i + 1][0]
    );
  }

  return { trimmed, remainingLengthMeters };
}

export function polylineLengthMeters(coords: RouteLineStringCoords): number {
  let sum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    sum += haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
  }
  return sum;
}

export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}
