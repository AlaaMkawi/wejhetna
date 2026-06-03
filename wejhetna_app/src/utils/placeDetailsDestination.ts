import type { PlaceForMap } from "../api/places";

export type MapDestination = { lat: number; lon: number; name?: string };

/** Build map destination from a known place (business / public service). */
export function destinationForKnownPlace(
  place: PlaceForMap,
  placeName: string
): MapDestination | null {
  if (!place.location) return null;
  return {
    lat: place.location.lat,
    lon: place.location.lon,
    name: placeName,
  };
}
