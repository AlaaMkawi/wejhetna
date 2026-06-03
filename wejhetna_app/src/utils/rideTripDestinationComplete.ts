import {
  completeRideTrip,
  getDriverRideRequests,
} from "../api/rides";

/** How long the destination-arrival message stays visible before auto-navigation. */
export const TRIP_DESTINATION_ARRIVAL_POPUP_MS = 7000;

/**
 * Mark ride as completed on the server (passenger-only API).
 * Driver callers pass the passenger's `regular_user_id` resolved from the request row.
 */
export async function completeRideTripAtDestination(
  rideRequestId: number,
  role: "DRIVER" | "REGULAR",
  callerUserId: number
): Promise<void> {
  let passengerUserId: number | null = null;

  if (role === "REGULAR") {
    passengerUserId = callerUserId;
  } else {
    const list = await getDriverRideRequests(callerUserId);
    const row = list.find((r) => r.id === rideRequestId);
    passengerUserId = row?.regular_user_id ?? null;
  }

  if (passengerUserId == null) {
    throw new Error("Passenger not found for ride");
  }

  try {
    await completeRideTrip({
      ride_request_id: rideRequestId,
      regular_user_id: passengerUserId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already completed/i.test(msg)) {
      throw err;
    }
  }
}
