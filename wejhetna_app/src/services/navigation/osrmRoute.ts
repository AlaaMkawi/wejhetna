import type { RouteLineStringCoords } from "../../types/navigation";

export type OsrmRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  coordinates: RouteLineStringCoords;
};

const OSRM_BASE = "https://router.project-osrm.org/route/v1";

export async function fetchOsrmDrivingRoute(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): Promise<OsrmRouteResult> {
  const coordinates = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM_BASE}/driving/${coordinates}?overview=full&geometries=geojson&alternatives=false&steps=false`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Routing service error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (data.code !== "Ok" || !data.routes?.length) {
    const msg =
      data.code === "NoRoute"
        ? "No route found between these points"
        : data.message || "No route found in response";
    throw new Error(msg);
  }

  const route = data.routes[0];
  const geometry = route.geometry;
  const coords: RouteLineStringCoords =
    geometry?.type === "LineString" && Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : [
          [from.lon, from.lat],
          [to.lon, to.lat],
        ];

  return {
    distanceMeters: route.distance ?? 0,
    durationSeconds: route.duration ?? 0,
    coordinates: coords,
  };
}
