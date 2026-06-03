import type { OpenDrivingRoutePreviewFromHomeParams } from "./homeMapRoutePreview";
import { runOpenDrivingRoutePreviewFromHome } from "./homeMapRoutePreview";

/** Destination built from a free map pick (not a Place record). */
export type MapPickedDestination = {
  lat: number;
  lon: number;
  name: string;
};

/**
 * Shared state after a valid in-boundary map tap/long-press:
 * shows {@link MapPickedDestinationPanel} (self-nav vs ride-with-driver) instead of opening RouteDetails.
 */
export function mapPickStateForChoicePanel(
  lat: number,
  lon: number,
  label: string
): {
  customPin: { lat: number; lon: number };
  destination: MapPickedDestination;
  rideDestinationInput: string;
} {
  const destination: MapPickedDestination = { lat, lon, name: label };
  return {
    customPin: { lat, lon },
    destination,
    rideDestinationInput: label,
  };
}

export type StartMapPickNavigationParams = Omit<
  OpenDrivingRoutePreviewFromHomeParams,
  "destination"
> & {
  destination: MapPickedDestination | null;
  onModalClose?: () => void;
  pickMapTapInFlightRef?: { current: boolean };
};

/**
 * Close choice modal, then run the same route-preview flow as place-details navigation.
 * Captures destination before any async work so Home draft cleanup cannot clear it early.
 */
export async function startMapPickNavigation(
  params: StartMapPickNavigationParams
): Promise<void> {
  const { destination, onModalClose, pickMapTapInFlightRef, ...routeParams } =
    params;
  if (!destination) {
    return;
  }
  onModalClose?.();
  if (pickMapTapInFlightRef) {
    pickMapTapInFlightRef.current = false;
  }
  try {
    await runOpenDrivingRoutePreviewFromHome({
      ...routeParams,
      destination,
    });
  } finally {
    if (pickMapTapInFlightRef) {
      pickMapTapInFlightRef.current = false;
    }
  }
}
