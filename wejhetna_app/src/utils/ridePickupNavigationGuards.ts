import type { RideRequestStatus } from "../api/rides";
import { normalizeRideRequestStatus } from "../api/rides";

/** Driver pickup navigation: acceptable once accepted or actively heading to pickup. */
export function isDriverRideStatusEligibleForPickupNav(
  status: RideRequestStatus | string | null | undefined
): boolean {
  const s = normalizeRideRequestStatus(status);
  return s === "accepted" || s === "on_the_way" || s === "driving_to_customer";
}

/** Passenger pickup viewer: driver must already be rolling (not merely accepted). */
export function isPassengerRideStatusEligibleForPickupNav(
  status: RideRequestStatus | string | null | undefined
): boolean {
  const s = normalizeRideRequestStatus(status);
  return s === "on_the_way" || s === "driving_to_customer";
}
