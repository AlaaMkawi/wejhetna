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

function destinationMatchesPlace(
  destination: MapDest,
  place: PlaceForMap | null
): boolean {
  if (!destination || !place?.location) return false;
  return (
    Math.abs(destination.lat - place.location.lat) < COORD_EPS &&
    Math.abs(destination.lon - place.location.lon) < COORD_EPS
  );
}

/** 📍 destination pin — only for free map picks / unnamed points, never with a known place sheet open. */
export function shouldShowDestinationMapPin(
  destination: MapDest,
  customPin: { lat: number; lon: number } | null,
  selectedPlace: PlaceForMap | null
): boolean {
  if (!destination || customPin || selectedPlace) return false;
  if (destinationMatchesPlace(destination, selectedPlace)) return false;
  return true;
}

/** Red custom-pin dot — map pick only, not while a known place is selected. */
export function shouldShowCustomMapPin(
  customPin: { lat: number; lon: number } | null,
  selectedPlace: PlaceForMap | null
): boolean {
  return !!customPin && !selectedPlace;
}
