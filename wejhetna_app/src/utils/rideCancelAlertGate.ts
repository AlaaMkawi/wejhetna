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
