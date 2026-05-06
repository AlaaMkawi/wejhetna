/** After passenger cancels their own ride, suppress the global “cancelled by driver” alert briefly. */
let passengerSelfCancelUntilMs = 0;

/** After driver cancels from the app, suppress misleading global alerts briefly. */
let driverSelfCancelUntilMs = 0;

/** After we already showed the verification-mismatch dialog from the verify handler, skip duplicate from poller. */
let verificationMismatchSelfAlertUntilMs = 0;

export function markPassengerCancelledOwnRide(): void {
  passengerSelfCancelUntilMs = Date.now() + 12000;
}

export function markDriverCancelledOwnRide(): void {
  driverSelfCancelUntilMs = Date.now() + 12000;
}

export function shouldSuppressDriverCancelledGlobalAlert(): boolean {
  return Date.now() < passengerSelfCancelUntilMs;
}

export function shouldSuppressDriverSideGlobalCancelAlert(): boolean {
  return Date.now() < driverSelfCancelUntilMs;
}

export function markVerificationMismatchSelfAlert(): void {
  verificationMismatchSelfAlertUntilMs = Date.now() + 18000;
}

export function shouldSuppressVerificationMismatchGlobalAlert(): boolean {
  return Date.now() < verificationMismatchSelfAlertUntilMs;
}

/** Prevent stacked cancellation dialogs for the same ride (multiple pollers / remount races). */
const CANCEL_UI_ALERT_TTL_MS = 120_000;
const cancelUiAlertShownAtMsByRideId = new Map<number, number>();

/**
 * Returns true exactly once per ride id per TTL window — use before any “ride was cancelled” `appAlert`.
 * Independent of self-cancel/suppression timestamps (those still apply on top).
 */
export function tryConsumeRideCancelledUiAlert(rideRequestId: number): boolean {
  const now = Date.now();
  const rid = Math.trunc(Number(rideRequestId));
  if (!Number.isFinite(rid) || rid < 1) {
    return true;
  }
  const prev = cancelUiAlertShownAtMsByRideId.get(rid);
  if (prev != null && now - prev < CANCEL_UI_ALERT_TTL_MS) {
    return false;
  }
  cancelUiAlertShownAtMsByRideId.set(rid, now);
  if (cancelUiAlertShownAtMsByRideId.size > 48) {
    for (const [k, t0] of cancelUiAlertShownAtMsByRideId) {
      if (now - t0 > CANCEL_UI_ALERT_TTL_MS) {
        cancelUiAlertShownAtMsByRideId.delete(k);
      }
    }
  }
  return true;
}
