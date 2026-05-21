import type { PlaceForMap } from "../api/places";
import { shouldClusterPlaces } from "./mapPlaceMarkerPolicy";

const EARTH_CIRCUMFERENCE_M = 40075016.686;
const TILE_SIZE_PX = 512;

function metersPerPixel(latitudeDeg: number, zoom: number): number {
  const latRad = (latitudeDeg * Math.PI) / 180;
  const safeZoom = Math.max(0, zoom);
  return (EARTH_CIRCUMFERENCE_M * Math.cos(latRad)) / (TILE_SIZE_PX * Math.pow(2, safeZoom));
}

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

function clusterRadiusPx(zoom: number): number {
  if (zoom < 11) return 56;
  if (zoom < 12.5) return 48;
  return 40;
}

export type PlaceClusterItem =
  | {
      type: "single";
      id: string;
      lat: number;
      lon: number;
      place: PlaceForMap;
    }
  | {
      type: "cluster";
      id: string;
      lat: number;
      lon: number;
      places: PlaceForMap[];
    };

/**
 * Groups map places into singles or count clusters (screen-pixel greedy grouping).
 * Selected place is always a lone pin and never folded into a cluster.
 */
export function clusterPlaceMarkers(
  places: readonly PlaceForMap[],
  zoom: number,
  anchorLatitude: number,
  selectedPlaceId?: number | null
): PlaceClusterItem[] {
  if (!Array.isArray(places) || places.length === 0) return [];

  const withLoc = places.filter(
    (p) => p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lon)
  );
  if (withLoc.length === 0) return [];

  const selected =
    selectedPlaceId != null
      ? withLoc.find((p) => p.id === selectedPlaceId) ?? null
      : null;

  const pool = selected
    ? withLoc.filter((p) => p.id !== selectedPlaceId)
    : withLoc;

  const out: PlaceClusterItem[] = [];

  if (selected?.location) {
    out.push({
      type: "single",
      id: `place_selected_${selected.id}`,
      lat: selected.location.lat,
      lon: selected.location.lon,
      place: selected,
    });
  }

  if (!shouldClusterPlaces(zoom)) {
    const sorted = [...pool].sort((a, b) => a.id - b.id);
    for (const place of sorted) {
      if (!place.location) continue;
      out.push({
        type: "single",
        id: `place_${place.id}`,
        lat: place.location.lat,
        lon: place.location.lon,
        place,
      });
    }
    return out;
  }

  const mPerPx = metersPerPixel(anchorLatitude, zoom);
  const clusterRadiusM = clusterRadiusPx(zoom) * mPerPx;
  const sorted = [...pool].sort((a, b) => a.id - b.id);

  type RawGroup = { lat: number; lon: number; places: PlaceForMap[] };
  const groups: RawGroup[] = [];

  for (const place of sorted) {
    const lat = place.location!.lat;
    const lon = place.location!.lon;
    let attached = false;
    for (const g of groups) {
      if (haversineMeters(g.lat, g.lon, lat, lon) <= clusterRadiusM) {
        g.places.push(place);
        const n = g.places.length;
        g.lat = g.lat + (lat - g.lat) / n;
        g.lon = g.lon + (lon - g.lon) / n;
        attached = true;
        break;
      }
    }
    if (!attached) {
      groups.push({ lat, lon, places: [place] });
    }
  }

  for (const g of groups) {
    if (g.places.length === 1) {
      const place = g.places[0];
      out.push({
        type: "single",
        id: `place_${place.id}`,
        lat: g.lat,
        lon: g.lon,
        place,
      });
    } else {
      out.push({
        type: "cluster",
        id: `place_cluster_${g.places.map((p) => p.id).join("_")}`,
        lat: g.lat,
        lon: g.lon,
        places: g.places,
      });
    }
  }

  return out;
}
