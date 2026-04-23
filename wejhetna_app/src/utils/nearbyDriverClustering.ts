import { NearbyDriver } from "../api/rides";

/**
 * Groups nearby drivers so that markers which would otherwise overlap on the
 * map become a single "cluster" bubble, with the exact same drivers fanning
 * out radially once they can no longer be meaningfully separated by zoom
 * (i.e. when they share the same GPS coordinates).
 *
 * Design notes:
 *  - We cluster in *screen pixels* because the user perceives overlap in
 *    pixels, not meters. Meters-per-pixel depends on zoom and latitude, so
 *    the threshold is converted accordingly.
 *  - Clustering is greedy and deterministic (drivers sorted by id), so the
 *    same input always produces the same visual result and React keys remain
 *    stable across renders.
 *  - When a cluster's drivers share effectively the same coordinates we
 *    "spider" them: fan them out around the centroid at a fixed pixel
 *    radius. This only happens at high zoom, where the user clearly wants
 *    to interact with individual drivers.
 */

export type DriverClusterItem =
  /** A lone driver — render as a normal marker at `driver` coordinates. */
  | { type: "single"; id: string; lat: number; lon: number; driver: NearbyDriver }
  /**
   * Multiple drivers too close to separate at current zoom. Render as a
   * count badge at [lat,lon]; tapping should zoom in.
   */
  | {
      type: "cluster";
      id: string;
      lat: number;
      lon: number;
      drivers: NearbyDriver[];
    }
  /**
   * Drivers at effectively identical coordinates but the user has zoomed in
   * as far as it helps — fan them out around the centroid so each is tappable.
   */
  | {
      type: "spread";
      id: string;
      lat: number;
      lon: number;
      driver: NearbyDriver;
    };

const EARTH_CIRCUMFERENCE_M = 40075016.686;
const TILE_SIZE_PX = 512; // MapLibre default; clustering is tolerant to small mismatches.

/** Meters-per-pixel for Web Mercator at the given latitude & zoom level. */
function metersPerPixel(latitudeDeg: number, zoom: number): number {
  const latRad = (latitudeDeg * Math.PI) / 180;
  const safeZoom = Math.max(0, zoom);
  return (EARTH_CIRCUMFERENCE_M * Math.cos(latRad)) / (TILE_SIZE_PX * Math.pow(2, safeZoom));
}

/** Great-circle distance (meters) — good enough for markers a few hundred meters apart. */
function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const x = s1 * s1 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, x)));
}

/** Offset a lat/lon by a pixel delta at the given zoom/latitude. */
function offsetLatLonByPixels(
  lat: number,
  lon: number,
  dxPx: number,
  dyPx: number,
  zoom: number
): { lat: number; lon: number } {
  const mPerPx = metersPerPixel(lat, zoom);
  const dxMeters = dxPx * mPerPx;
  const dyMeters = dyPx * mPerPx;

  // 1 deg of latitude ≈ 111,320 m anywhere on the globe.
  const deltaLat = dyMeters / 111320;
  // 1 deg of longitude shrinks with cos(lat).
  const deltaLon = dxMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + deltaLat, lon: lon + deltaLon };
}

export type ClusterDriversOptions = {
  /**
   * Max pixel distance between two drivers for them to be grouped.
   * Default matches a comfortable tap target (~44dp).
   */
  clusterRadiusPx?: number;
  /**
   * Zoom level at which the clusterer starts spreading near-identical
   * drivers in a ring instead of hiding them behind a count badge.
   */
  spreadZoom?: number;
  /** Meters under which we treat two drivers as "same point" for spreading. */
  sameSpotThresholdM?: number;
  /** Pixel radius of the spread ring at the given zoom. */
  spreadRingPx?: number;
};

const DEFAULT_OPTIONS: Required<ClusterDriversOptions> = {
  clusterRadiusPx: 44,
  spreadZoom: 16,
  sameSpotThresholdM: 12,
  spreadRingPx: 34,
};

/**
 * Group nearby drivers into singles/clusters/spread items for map rendering.
 *
 * @param drivers         Raw nearby-driver list.
 * @param zoom            Current map zoom level.
 * @param anchorLatitude  Latitude used to convert meters-per-pixel (map
 *                        center or user location work equally well).
 */
export function clusterNearbyDrivers(
  drivers: readonly NearbyDriver[],
  zoom: number,
  anchorLatitude: number,
  options: ClusterDriversOptions = {}
): DriverClusterItem[] {
  if (!Array.isArray(drivers) || drivers.length === 0) return [];

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const mPerPx = metersPerPixel(anchorLatitude, zoom);
  const clusterRadiusM = opts.clusterRadiusPx * mPerPx;

  // Stable ordering keeps React keys / animations consistent across renders.
  const sorted = [...drivers].sort((a, b) => a.driver_user_id - b.driver_user_id);

  type RawGroup = { lat: number; lon: number; drivers: NearbyDriver[] };
  const groups: RawGroup[] = [];

  for (const d of sorted) {
    // Greedy: attach to the first existing group whose centroid is within range.
    let attached = false;
    for (const g of groups) {
      if (haversineMeters(g.lat, g.lon, d.lat, d.lon) <= clusterRadiusM) {
        g.drivers.push(d);
        // Running centroid keeps the cluster anchor near the actual drivers.
        const n = g.drivers.length;
        g.lat = g.lat + (d.lat - g.lat) / n;
        g.lon = g.lon + (d.lon - g.lon) / n;
        attached = true;
        break;
      }
    }
    if (!attached) {
      groups.push({ lat: d.lat, lon: d.lon, drivers: [d] });
    }
  }

  const out: DriverClusterItem[] = [];
  for (const g of groups) {
    if (g.drivers.length === 1) {
      const d = g.drivers[0];
      out.push({
        type: "single",
        id: `driver_${d.driver_user_id}`,
        lat: d.lat,
        lon: d.lon,
        driver: d,
      });
      continue;
    }

    // Multiple drivers — decide between a count badge and the spread ring.
    // Spread only when zoomed in AND the drivers are essentially at the
    // same coordinates, so panning/zooming still feels natural.
    const maxSpread = g.drivers.reduce((m, d) => {
      const dist = haversineMeters(g.lat, g.lon, d.lat, d.lon);
      return dist > m ? dist : m;
    }, 0);

    const shouldSpread =
      zoom >= opts.spreadZoom && maxSpread <= opts.sameSpotThresholdM;

    if (!shouldSpread) {
      out.push({
        type: "cluster",
        id: `cluster_${g.drivers.map((d) => d.driver_user_id).join("_")}`,
        lat: g.lat,
        lon: g.lon,
        drivers: g.drivers,
      });
      continue;
    }

    // Fan drivers around the centroid on a fixed pixel radius.
    const n = g.drivers.length;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n - Math.PI / 2; // start at top
      const dx = Math.cos(angle) * opts.spreadRingPx;
      const dy = Math.sin(angle) * opts.spreadRingPx;
      const offset = offsetLatLonByPixels(g.lat, g.lon, dx, dy, zoom);
      const d = g.drivers[i];
      out.push({
        type: "spread",
        id: `spread_${d.driver_user_id}`,
        lat: offset.lat,
        lon: offset.lon,
        driver: d,
      });
    }
  }

  return out;
}

/**
 * Target zoom level when the user taps a cluster. We step up a few levels
 * rather than snapping straight to max zoom so that clusters of clusters
 * can be expanded gradually.
 */
export function zoomInTargetForCluster(currentZoom: number): number {
  // +2 is just enough to split most clusters while keeping orientation.
  const next = currentZoom + 2;
  return Math.min(18, Math.max(currentZoom + 1, next));
}
