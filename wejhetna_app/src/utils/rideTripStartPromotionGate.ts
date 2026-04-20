/** After local OTP success we show RideVerifySuccessModal; skip duplicate promotion from poller for the same ride. */
const suppressInProgressPromotionUntilByRideId: Record<number, number> = {};

export function markTripStartHandledLocally(rideId: number): void {
  suppressInProgressPromotionUntilByRideId[rideId] = Date.now() + 25000;
}

export function shouldSuppressInProgressTripPromotion(rideId: number): boolean {
  return Date.now() < (suppressInProgressPromotionUntilByRideId[rideId] ?? 0);
}
