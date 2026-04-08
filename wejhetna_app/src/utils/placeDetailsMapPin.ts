import type { PlaceForMap } from "../api/places";

const COORD_EPS = 1e-5;

type MapDest = { lat: number; lon: number; name?: string } | null;

/**
 * When place details close, remove the extra map pin only if `destination` was set to that
 * place's coordinates (place-details highlight). Leaves other destinations (e.g. map-pick label
 * at different coords, or long-press) unchanged.
 */
export function destinationAfterClosingPlaceDetails(
  destination: MapDest,
  closedPlace: PlaceForMap | null
): MapDest {
  if (!closedPlace?.location || !destination) return destination;
  const sameLat = Math.abs(destination.lat - closedPlace.location.lat) < COORD_EPS;
  const sameLon = Math.abs(destination.lon - closedPlace.location.lon) < COORD_EPS;
  return sameLat && sameLon ? null : destination;
}
