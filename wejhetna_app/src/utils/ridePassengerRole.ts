/**
 * Users who request rides and use passenger transport UX (alerts, RideTracking tab).
 * Matches backend `_user_can_request_rides` (REGULAR, BUSINESS_OWNER).
 */
export function isPassengerRideUserRole(role: string | null | undefined): boolean {
  return role === "REGULAR" || role === "BUSINESS_OWNER";
}
